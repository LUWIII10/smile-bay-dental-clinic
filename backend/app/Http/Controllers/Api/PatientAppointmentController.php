<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The "My Appointments" page's own backend — every appointment the logged-in
 * patient has ever had, across all statuses, plus letting them cancel their
 * own still-upcoming ones. Separate from AppointmentController (which only
 * handles creating a new booking) since the read/cancel surface here is a
 * different concern with its own scoping rules.
 */
class PatientAppointmentController extends Controller
{
    /**
     * Dashboard-overview data for the logged-in patient — mirrors
     * DentistScheduleController::summary()'s pattern (real query results,
     * not mock constants) so the Patient dashboard is on the same footing
     * as the Dentist one.
     */
    public function summary(Request $request)
    {
        $patient = $request->user()->patient;

        if (! $patient) {
            return response()->json(['data' => null]);
        }

        $today = now()->toDateString();

        $totalVisits = Appointment::where('patient_id', $patient->id)
            ->where('status', 'completed')
            ->count();

        $upcomingCount = Appointment::where('patient_id', $patient->id)
            ->whereIn('status', ['confirmed', 'pending_verification'])
            ->where('appointment_date', '>=', $today)
            ->count();

        $lastVisit = Appointment::where('patient_id', $patient->id)
            ->where('status', 'completed')
            ->orderByDesc('appointment_date')
            ->first();

        $nextAppointment = Appointment::where('patient_id', $patient->id)
            ->whereIn('status', ['confirmed', 'pending_verification'])
            ->where('appointment_date', '>=', $today)
            ->with(['dentist:id,name', 'service:id,name,duration_minutes'])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->first();

        $recentActivity = AppointmentStatusLog::whereHas(
            'appointment',
            fn ($q) => $q->where('patient_id', $patient->id)
        )
            ->with('appointment.service:id,name')
            ->orderByDesc('created_at')
            ->limit(5)
            ->get()
            ->map(fn (AppointmentStatusLog $log) => [
                'id' => $log->id,
                'description' => ($log->appointment?->service?->name ?? 'Your appointment')." is now \"{$log->new_status}\"".($log->note ? " — {$log->note}" : ''),
                'timestamp' => $log->created_at?->diffForHumans(),
            ]);

        return response()->json([
            'data' => [
                'stats' => [
                    'totalVisits' => $totalVisits,
                    'upcoming' => $upcomingCount,
                    'lastVisitDate' => $lastVisit?->appointment_date?->format('M j, Y'),
                ],
                'nextAppointment' => $nextAppointment,
                'recentActivity' => $recentActivity,
            ],
        ]);
    }

    public function index(Request $request)
    {
        $patient = $request->user()->patient;

        if (! $patient) {
            return response()->json(['data' => []]);
        }

        $appointments = Appointment::where('patient_id', $patient->id)
            ->with([
                'dentist:id,name',
                'dentist.dentistProfile:id,user_id,photo_path',
                'service:id,name,duration_minutes',
            ])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Patient-initiated cancel — only their own appointment, and only while
     * it's still something worth cancelling (confirmed or awaiting
     * verification, and not already in the past). Setting status to
     * 'cancelled' is enough to free the slot back up: it's outside
     * AppointmentSlotService::OCCUPYING_STATUSES already.
     */
    public function cancel(Request $request, Appointment $appointment)
    {
        $patient = $request->user()->patient;

        if (! $patient || $appointment->patient_id !== $patient->id) {
            return response()->json(['message' => 'This appointment does not belong to you.'], 403);
        }

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $isCancellableStatus = in_array($appointment->status, ['confirmed', 'pending_verification'], true);
        $isUpcoming = $appointment->appointment_date->toDateString() >= now()->toDateString();

        if (! $isCancellableStatus || ! $isUpcoming) {
            return response()->json([
                'message' => 'Only an upcoming confirmed or pending appointment can be cancelled.',
            ], 422);
        }

        DB::transaction(function () use ($appointment, $validated, $request) {
            $oldStatus = $appointment->status;

            $appointment->update([
                'status' => 'cancelled',
                'cancellation_reason' => $validated['reason'] ?? null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => $oldStatus,
                'new_status' => 'cancelled',
                'changed_by' => $request->user()->id,
                'note' => 'Cancelled by patient.'.(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
            ]);
        });

        $appointment->load(['dentist:id,name', 'service:id,name']);

        // Only the assigned dentist cares that their slot just freed up —
        // staff already see every cancellation via the All Appointments
        // list, no separate broadcast needed there.
        if ($appointment->dentist_id) {
            Notification::notifyUser(
                $appointment->dentist_id,
                'Appointment cancelled',
                "{$appointment->service->name} on {$appointment->appointment_date->format('M j')} at {$appointment->appointment_time} was cancelled by the patient.",
                '/dentist/schedule'
            );
        }

        return response()->json(['message' => 'Appointment cancelled.', 'data' => $appointment]);
    }
}
