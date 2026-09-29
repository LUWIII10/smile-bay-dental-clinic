<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use App\Services\AppointmentSlotService;
use App\Services\CancellationPolicyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * The "My Appointments" page's own backend — every appointment the logged-in
 * patient has ever had, across all statuses, plus letting them cancel their
 * own still-upcoming ones. Separate from AppointmentController (which only
 * handles creating a new booking) since the read/cancel surface here is a
 * different concern with its own scoping rules.
 */
class PatientAppointmentController extends Controller
{
    public function __construct(
        private CancellationPolicyService $cancellationPolicy,
        private AppointmentSlotService $slots,
    ) {}

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
                'status' => $log->new_status,
                // Two separate fields, not one pre-joined sentence — the
                // frontend renders its own layout (name + badge on one line,
                // note below) and stored note text can itself already
                // contain an em-dash (see PediatricVerificationController),
                // so re-splitting a joined string back apart would be
                // fragile in exactly the way a badge/note split needs not
                // to be.
                'serviceName' => $log->appointment?->service?->name ?? 'Your appointment',
                'note' => $log->note,
                'timestamp' => $log->created_at?->diffForHumans(['short' => true]),
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
                'cancellationPolicy' => $this->cancellationPolicy->statusFor($patient),
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
                // Lets My Appointments show "what was actually done" for a
                // completed visit without sending the patient to a separate
                // My Dental Records page to find it — reuses the same
                // treatment_history row that page's own Treatment Details
                // modal already reads, just surfaced here too. Null for any
                // appointment nobody has logged a procedure against yet
                // (see Appointment::treatmentHistoryEntry()'s own comment).
                'treatmentHistoryEntry.performedBy:id,name',
            ])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Open "Book a Follow-up" recommendations for the logged-in patient —
     * staff-enabled (StaffAppointmentController::enableFollowUp()), not yet
     * booked (Appointment::scopeWithOpenFollowUpRecommendation()). Drives
     * both the "Book a Follow-up" badge count on My Appointments and the
     * locked procedure shown in BookFollowUp.jsx's first step.
     */
    public function followUpRecommendations(Request $request)
    {
        $patient = $request->user()->patient;

        if (! $patient) {
            return response()->json(['data' => []]);
        }

        $recommendations = Appointment::where('patient_id', $patient->id)
            ->withOpenFollowUpRecommendation()
            ->with([
                'recommendedFollowUpService:id,name,duration_minutes',
                'followUpRecommendedBy:id,name',
                'dentist:id,name',
            ])
            ->orderByDesc('follow_up_recommended_at')
            ->get(['id', 'dentist_id', 'appointment_date', 'recommended_follow_up_service_id', 'follow_up_recommended_by', 'follow_up_recommended_at']);

        return response()->json(['data' => $recommendations]);
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

        // After the cancellation itself is safely committed — the 3-strike
        // policy escalation (see CancellationPolicyService) is a secondary
        // consequence, not something that should ever block or roll back
        // the cancel it's reacting to.
        $this->cancellationPolicy->evaluateAfterCancellation($patient);

        return response()->json(['message' => 'Appointment cancelled.', 'data' => $appointment]);
    }

    /**
     * Patient accepts the date the pediatric dentist proposed
     * (PediatricVerificationController::proposeNewDate()) — the dentist
     * already confirmed availability by picking that date, so accepting is
     * what actually clears the pediatric gate, mirroring verify()'s own
     * approve branch (cash fully confirms; HMO — currently unreachable,
     * pediatric only accepts cash today, kept for the same reason verify()
     * keeps it — stays pending for staff next).
     */
    public function acceptProposedDate(Request $request, Appointment $appointment)
    {
        $patient = $request->user()->patient;

        if (! $patient || $appointment->patient_id !== $patient->id) {
            return response()->json(['message' => 'This appointment does not belong to you.'], 403);
        }

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->dentist_proposed_new_date_at === null
            || ! $appointment->service->isPediatric()
        ) {
            return response()->json(['message' => 'There is no proposed date to accept for this appointment.'], 422);
        }

        $isCash = $appointment->patient_type_snapshot === 'cash';

        DB::transaction(function () use ($appointment, $isCash, $request) {
            $appointment->update([
                'pediatric_confirmed_at' => now(),
                'pediatric_confirmed_by' => $appointment->dentist_id,
                'dentist_proposed_new_date_at' => null,
                'dentist_reschedule_reason' => null,
                'status' => $isCash ? 'confirmed' : $appointment->status,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => 'pending_verification',
                'new_status' => $appointment->status,
                'changed_by' => $request->user()->id,
                'note' => 'Patient accepted the pediatric dentist\'s proposed date.',
            ]);
        });

        $appointment->load(['service:id,name,duration_minutes', 'dentist:id,name']);

        if ($isCash) {
            try {
                Mail::to($request->user()->email)->send(new AppointmentConfirmedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => AppointmentConfirmedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyUser(
                $request->user()->id,
                'Appointment confirmed',
                "Your {$appointment->service->name} appointment is confirmed.",
                '/patient/appointments'
            );
        } else {
            Notification::notifyRolesOnce(
                ['dental_assistant', 'admin'],
                $appointment->id,
                'HMO verification needed',
                "Pediatric booking for {$request->user()->name} is now ready for HMO verification."
            );
        }

        return response()->json(['message' => 'Date accepted.', 'data' => $appointment]);
    }

    /**
     * Patient counters the pediatric dentist's proposed date with a
     * different one of their own — clears dentist_proposed_new_date_at
     * (a patient-set date is the normal, unmarked state) so this lands
     * back in the dentist's plain "Awaiting Confirmation" queue rather
     * than looking like it's still waiting on the patient.
     */
    public function requestDifferentDate(Request $request, Appointment $appointment)
    {
        $patient = $request->user()->patient;

        if (! $patient || $appointment->patient_id !== $patient->id) {
            return response()->json(['message' => 'This appointment does not belong to you.'], 403);
        }

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->dentist_proposed_new_date_at === null
            || ! $appointment->service->isPediatric()
        ) {
            return response()->json(['message' => 'This appointment has no proposed date to change.'], 422);
        }

        $validated = $request->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
        ]);

        $appointment->load('service:id,duration_minutes');
        $oldDate = $appointment->appointment_date->toDateString();
        $oldTime = $appointment->appointment_time;

        $moved = DB::transaction(function () use ($appointment, $validated) {
            $available = $this->slots->isSlotAvailable(
                $appointment->dentist_id,
                $validated['appointment_date'],
                $validated['appointment_time'],
                $appointment->service->duration_minutes,
                $appointment->id,
            );

            if (! $available) {
                return false;
            }

            $appointment->update([
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
                'dentist_proposed_new_date_at' => null,
                'dentist_reschedule_reason' => null,
            ]);

            return true;
        });

        if (! $moved) {
            return response()->json([
                'message' => 'That time is no longer available. Please choose another.',
            ], 409);
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => 'pending_verification',
            'new_status' => 'pending_verification',
            'changed_by' => $request->user()->id,
            'note' => "Patient requested a different date, from {$oldDate} {$oldTime} to {$validated['appointment_date']} {$validated['appointment_time']}.",
        ]);

        $appointment->load(['service:id,name,duration_minutes', 'dentist:id,name']);
        Notification::notifyUser(
            $appointment->dentist_id,
            'Pediatric review needed',
            "{$request->user()->name} requested a different date for their {$appointment->service->name} visit.",
            '/dentist/pediatric-queue'
        );

        return response()->json(['message' => 'New date sent for review.', 'data' => $appointment]);
    }

    /**
     * Patient accepts the date staff proposed after verifying HMO coverage
     * on a booking whose original date had already passed
     * (StaffVerificationController::proposeNewDate()) — unlike
     * acceptProposedDate() above (the pediatric-dentist equivalent), this
     * always goes straight to 'confirmed': coverage is already verified at
     * this point (verified_at is the tell), so there's nothing left to wait
     * on besides the date itself. Re-checks the slot regardless — time may
     * have passed since staff proposed it and someone else could have taken
     * it, same as every other slot-consuming action in this app.
     */
    public function acceptStaffProposedDate(Request $request, Appointment $appointment)
    {
        $patient = $request->user()->patient;

        if (! $patient || $appointment->patient_id !== $patient->id) {
            return response()->json(['message' => 'This appointment does not belong to you.'], 403);
        }

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->dentist_proposed_new_date_at === null
            || $appointment->verified_at === null
        ) {
            return response()->json(['message' => 'There is no proposed date to accept for this appointment.'], 422);
        }

        $appointment->load('service:id,duration_minutes');

        $confirmed = DB::transaction(function () use ($appointment) {
            $available = $this->slots->isSlotAvailable(
                $appointment->dentist_id,
                $appointment->appointment_date->toDateString(),
                substr($appointment->appointment_time, 0, 5),
                $appointment->service->duration_minutes,
                $appointment->id,
            );

            if (! $available) {
                return false;
            }

            $appointment->update([
                'status' => 'confirmed',
                'dentist_proposed_new_date_at' => null,
                'dentist_reschedule_reason' => null,
            ]);

            return true;
        });

        if (! $confirmed) {
            return response()->json([
                'message' => 'That time is no longer available — please request a different date instead.',
            ], 409);
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => 'pending_verification',
            'new_status' => 'confirmed',
            'changed_by' => $request->user()->id,
            'note' => 'Patient accepted the staff-proposed date — HMO coverage was already verified, so this fully confirms the appointment.',
        ]);

        $appointment->load(['service:id,name,duration_minutes', 'patient', 'dentist:id,name']);
        try {
            Mail::to($request->user()->email)->send(new AppointmentConfirmedMail($appointment));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => AppointmentConfirmedMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $request->user()->id,
            'Appointment confirmed',
            "Your {$appointment->service->name} appointment is confirmed.",
            '/patient/appointments'
        );

        return response()->json(['message' => 'Appointment confirmed.', 'data' => $appointment]);
    }

    /**
     * Patient counters the staff-proposed date with a different one of their
     * own — same "no further verification needed" reasoning as
     * acceptStaffProposedDate() above, so this also goes straight to
     * 'confirmed' once the new slot checks out, unlike
     * requestDifferentDate()'s pediatric equivalent (which lands back in the
     * dentist's own review queue instead, since that flow's proposer still
     * has to personally confirm the slot).
     */
    public function requestDifferentDateForVerifiedHmo(Request $request, Appointment $appointment)
    {
        $patient = $request->user()->patient;

        if (! $patient || $appointment->patient_id !== $patient->id) {
            return response()->json(['message' => 'This appointment does not belong to you.'], 403);
        }

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->dentist_proposed_new_date_at === null
            || $appointment->verified_at === null
        ) {
            return response()->json(['message' => 'This appointment has no proposed date to change.'], 422);
        }

        $validated = $request->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
        ]);

        $appointment->load('service:id,duration_minutes');

        $confirmed = DB::transaction(function () use ($appointment, $validated) {
            $available = $this->slots->isSlotAvailable(
                $appointment->dentist_id,
                $validated['appointment_date'],
                $validated['appointment_time'],
                $appointment->service->duration_minutes,
                $appointment->id,
            );

            if (! $available) {
                return false;
            }

            $appointment->update([
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
                'status' => 'confirmed',
                'dentist_proposed_new_date_at' => null,
                'dentist_reschedule_reason' => null,
            ]);

            return true;
        });

        if (! $confirmed) {
            return response()->json([
                'message' => 'That time is no longer available. Please choose another.',
            ], 409);
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => 'pending_verification',
            'new_status' => 'confirmed',
            'changed_by' => $request->user()->id,
            'note' => "Patient chose a different date than staff proposed, to {$validated['appointment_date']} {$validated['appointment_time']} — HMO coverage was already verified, so this fully confirms the appointment.",
        ]);

        $appointment->load(['service:id,name,duration_minutes', 'patient', 'dentist:id,name']);
        try {
            Mail::to($request->user()->email)->send(new AppointmentConfirmedMail($appointment));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => AppointmentConfirmedMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $request->user()->id,
            'Appointment confirmed',
            "Your {$appointment->service->name} appointment is confirmed.",
            '/patient/appointments'
        );

        return response()->json(['message' => 'Appointment confirmed.', 'data' => $appointment]);
    }
}
