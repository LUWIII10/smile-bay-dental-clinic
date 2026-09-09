<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use Illuminate\Http\Request;

class DentistScheduleController extends Controller
{
    /**
     * The logged-in dentist's own agenda — today and every upcoming
     * confirmed visit, plus anything already completed today (so "today"
     * reads as the full day, not just what's left). Pending-verification
     * appointments aren't shown here yet — they're staff's problem until
     * approved, at which point they become a normal confirmed row.
     */
    public function index(Request $request)
    {
        $today = now()->toDateString();

        $appointments = Appointment::where('dentist_id', $request->user()->id)
            ->where('appointment_date', '>=', $today)
            ->where(function ($query) use ($today) {
                $query->where('status', 'confirmed')
                    ->orWhere(function ($q) use ($today) {
                        $q->where('status', 'completed')->where('appointment_date', $today);
                    });
            })
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name,duration_minutes'])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Dashboard-overview data for the logged-in dentist — replaces the
     * mock DENTIST_MOCK constants the /dentist/dashboard page used to
     * render. Scoped to dentist_id = auth user exactly like index() above,
     * so the Pediatric Dentistry account naturally only ever sees its own
     * pediatric appointments here — no separate pediatric-specific query
     * needed, correct dentist_id scoping is sufficient.
     */
    public function summary(Request $request)
    {
        $dentistId = $request->user()->id;
        $today = now()->toDateString();
        $weekStart = now()->startOfWeek()->toDateString();
        $weekEnd = now()->endOfWeek()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();
        $monthEnd = now()->endOfMonth()->toDateString();

        // "Visible" here means actually on the books — confirmed or already
        // completed. Still-pending (incl. pediatric awaiting review) isn't
        // a real commitment yet, so it's deliberately excluded from these
        // counts, matching index()'s own scope above.
        $visible = fn ($query) => $query->whereIn('status', ['confirmed', 'completed']);

        $todayCount = $visible(Appointment::where('dentist_id', $dentistId)
            ->where('appointment_date', $today))->count();

        $thisWeekCount = $visible(Appointment::where('dentist_id', $dentistId)
            ->whereBetween('appointment_date', [$weekStart, $weekEnd]))->count();

        $patientsThisMonth = Appointment::where('dentist_id', $dentistId)
            ->where('status', 'completed')
            ->whereBetween('appointment_date', [$monthStart, $monthEnd])
            ->distinct('patient_id')
            ->count('patient_id');

        $todaysSchedule = $visible(Appointment::where('dentist_id', $dentistId)
            ->where('appointment_date', $today))
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name'])
            ->orderBy('appointment_time')
            ->get();

        $upcoming = Appointment::where('dentist_id', $dentistId)
            ->where('status', 'confirmed')
            ->where('appointment_date', '>', $today)
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name'])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->limit(5)
            ->get();

        return response()->json([
            'data' => [
                'stats' => [
                    'today' => $todayCount,
                    'thisWeek' => $thisWeekCount,
                    'patientsThisMonth' => $patientsThisMonth,
                ],
                'todaysSchedule' => $todaysSchedule,
                'upcoming' => $upcoming,
            ],
        ]);
    }
}
