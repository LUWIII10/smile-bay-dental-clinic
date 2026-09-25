<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\TreatmentHistory;
use Illuminate\Http\Request;

class DentistScheduleController extends Controller
{
    /**
     * The logged-in dentist's own agenda — every confirmed visit (past,
     * today, or upcoming — a confirmed appointment whose date has already
     * passed without being completed still needs the dentist to resolve it
     * here, not disappear off their schedule), plus anything already
     * completed today (so "today" reads as the full day, not just what's
     * left), plus any completed visit — any date — that still has no
     * treatment_history row, so it keeps surfacing here until the dentist
     * backs it out with a real record instead of silently staying invisible,
     * plus any of this dentist's own HMO bookings still sitting in
     * pending_verification — visible here as a read-only heads-up (no
     * Complete/Reschedule/Cancel action attaches to it) so the dentist knows
     * it's coming, while StaffVerificationController::verify() (dental
     * assistant/admin) remains the only place that actually approves or
     * rejects it. It becomes a normal actionable confirmed row the moment
     * staff approves it.
     */
    public function index(Request $request)
    {
        $today = now()->toDateString();

        $appointments = Appointment::where('dentist_id', $request->user()->id)
            ->where(function ($query) use ($today) {
                $query->where('status', 'confirmed')
                    ->orWhere(function ($q) use ($today) {
                        $q->where('status', 'completed')->where('appointment_date', $today);
                    })
                    ->orWhere(function ($q) {
                        $q->where('status', 'completed')->whereDoesntHave('treatmentHistoryEntry');
                    })
                    ->orWhere(function ($q) {
                        $q->where('status', 'pending_verification')->where('patient_type_snapshot', 'hmo');
                    });
            })
            ->with([
                'patient:id,patient_number,first_name,last_name',
                'service:id,name,duration_minutes',
                // Only ever non-null for a completed row saved through the
                // new Complete-and-record flow — carries the procedure
                // name/notes the "Completed today" section on this page
                // shows. Null for anything not completed, and for any
                // completed row from before this pass existed.
                'treatmentHistoryEntry',
            ])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Every procedure this dentist has ever recorded, across all patients
     * and dates — sourced from treatment_history (what was actually done),
     * not from appointments (what was booked). Nothing here filters by
     * appointment_id being set: the 7 rows that predate this feature have
     * none and still belong on this list, same as any row logged through
     * Patient Records' own "+ Log Procedure" going forward.
     */
    public function completedPatients(Request $request)
    {
        $entries = TreatmentHistory::where('performed_by', $request->user()->id)
            ->with(['dentalRecord.patient:id,patient_number,first_name,last_name'])
            ->orderByDesc('performed_at')
            ->orderByDesc('id')
            ->get();

        return response()->json(['data' => $entries]);
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

        // Matches exactly what PediatricVerificationController::index() shows
        // this dentist — via the shared Appointment::scopeAwaitingPediatricReview()
        // scope, so this count and that queue can never drift apart. Always 0
        // for a non-pediatric dentist, since dentist_id scoping alone means
        // pediatric bookings never land on their account.
        $pediatricPending = Appointment::awaitingPediatricReview($dentistId)->count();

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
                    'pediatricPending' => $pediatricPending,
                ],
                'todaysSchedule' => $todaysSchedule,
                'upcoming' => $upcoming,
            ],
        ]);
    }
}
