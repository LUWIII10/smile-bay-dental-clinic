<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\AppointmentRescheduledMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use App\Services\AppointmentSlotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * The pediatric dentist's own review queue — separate from
 * StaffVerificationController because the actor and the gate are
 * different: this is the pediatric DENTIST confirming a slot they'll
 * personally take, not staff verifying HMO coverage. A pediatric HMO
 * booking passes through both, in order (this one first).
 */
class PediatricVerificationController extends Controller
{
    public function __construct(private AppointmentSlotService $slots) {}

    /**
     * Appointments assigned to the logged-in pediatric dentist that are
     * still awaiting their review. role:dentist is shared by every dentist
     * account, but scoping to dentist_id = auth user means a non-pediatric
     * dentist simply sees an empty queue for genuinely pediatric bookings —
     * pediatric appointments are only ever assigned to the pediatric
     * dentist (enforced in AppointmentController::store() via the
     * dentist_services check).
     *
     * The is_pediatric filter is required on top of that, not redundant:
     * dentist_id scoping alone only guarantees pediatric bookings never
     * land on the WRONG dentist — it says nothing about a general dentist's
     * own ORDINARY pending_verification bookings, which also have a null
     * pediatric_confirmed_at (never touched for a non-pediatric service)
     * and would otherwise show up here too. Confirmed against real data:
     * Dr. Ramirez's own regular HMO checkups were appearing as "awaiting
     * pediatric review" before this filter existed.
     */
    public function index(Request $request)
    {
        $appointments = Appointment::where('dentist_id', $request->user()->id)
            ->where('status', 'pending_verification')
            ->whereNull('pediatric_confirmed_at')
            ->whereHas('service', fn ($q) => $q->where('is_pediatric', true))
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name,duration_minutes'])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Approve or reject a pediatric slot. Approving a cash booking confirms
     * it outright (nothing else was blocking it); approving an HMO booking
     * only clears the pediatric gate — it stays pending_verification for
     * staff to verify coverage next, matching
     * StaffVerificationController's own gate on pediatric_confirmed_at.
     */
    public function verify(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        $validated = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->pediatric_confirmed_at !== null
            || ! $appointment->service->isPediatric()
        ) {
            return response()->json([
                'message' => 'Only an appointment awaiting pediatric review can be approved or rejected here.',
            ], 422);
        }

        $isApprove = $validated['action'] === 'approve';
        $isCash = $appointment->patient_type_snapshot === 'cash';
        $reason = ! $isApprove ? ($validated['reason'] ?? null) : null;

        DB::transaction(function () use ($appointment, $isApprove, $isCash, $reason, $request) {
            if ($isApprove) {
                $appointment->update([
                    'pediatric_confirmed_at' => now(),
                    'pediatric_confirmed_by' => $request->user()->id,
                    // Cash: nothing else was gating this appointment, so it's
                    // now fully confirmed. HMO: status stays exactly as it
                    // was — pending_verification — now eligible for staff.
                    'status' => $isCash ? 'confirmed' : $appointment->status,
                ]);

                AppointmentStatusLog::create([
                    'appointment_id' => $appointment->id,
                    'old_status' => 'pending_verification',
                    'new_status' => $appointment->status,
                    'changed_by' => $request->user()->id,
                    'note' => $isCash
                        ? 'Pediatric slot confirmed by pediatric dentist — cash, auto-confirmed.'
                        : 'Pediatric slot confirmed by pediatric dentist — HMO, now queued for staff verification.',
                ]);
            } else {
                $appointment->update([
                    'status' => 'rejected',
                    'pediatric_confirmed_at' => now(),
                    'pediatric_confirmed_by' => $request->user()->id,
                    'cancellation_reason' => $reason,
                ]);

                AppointmentStatusLog::create([
                    'appointment_id' => $appointment->id,
                    'old_status' => 'pending_verification',
                    'new_status' => 'rejected',
                    'changed_by' => $request->user()->id,
                    'note' => 'Pediatric slot rejected by pediatric dentist.'.($reason ? ' Reason: '.$reason : ''),
                ]);
            }
        });

        $appointment->load(['patient.user', 'service', 'dentist']);
        $patientEmail = $appointment->patient->user->email;

        if ($isApprove) {
            // Only email now if this fully confirmed the appointment (cash).
            // The HMO case stays silent here — no status actually changed
            // yet from the patient's perspective, and they'll get
            // AppointmentConfirmedMail when staff approve next, same as
            // every other HMO booking today.
            if ($isCash) {
                try {
                    Mail::to($patientEmail)->send(new AppointmentConfirmedMail($appointment));
                } catch (\Throwable $e) {
                    Log::warning('Appointment email failed to send', [
                        'mailable' => AppointmentConfirmedMail::class,
                        'appointment_id' => $appointment->id,
                        'error' => $e->getMessage(),
                    ]);
                }
                Notification::notifyUser(
                    $appointment->patient->user_id,
                    'Appointment confirmed',
                    "Your {$appointment->service->name} appointment is confirmed.",
                    '/patient/appointments'
                );
            } else {
                Notification::notifyRolesOnce(
                    ['dental_assistant', 'admin'],
                    $appointment->id,
                    'HMO verification needed',
                    "Pediatric booking for {$appointment->patient->first_name} {$appointment->patient->last_name} is now ready for HMO verification."
                );
            }
        } else {
            try {
                Mail::to($patientEmail)->send(new AppointmentRejectedMail($appointment, $reason));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => AppointmentRejectedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyUser(
                $appointment->patient->user_id,
                'Appointment rejected',
                $reason ? "Your pediatric booking couldn't be confirmed: {$reason}" : 'Your pediatric booking could not be confirmed.',
                '/patient/appointments'
            );
        }

        return response()->json([
            'message' => $isApprove
                ? ($isCash ? 'Pediatric slot confirmed — appointment is now confirmed.' : 'Pediatric slot confirmed — now pending HMO verification.')
                : 'Pediatric appointment rejected.',
            'data' => $appointment,
        ]);
    }

    /**
     * Dentist-initiated: move a still-unresolved pediatric request to a new
     * date/time — meant for the "Needs New Date" case (the original date
     * passed with no approve/reject decision), though nothing here actually
     * requires it to already be overdue. Unlike verify(), this never
     * touches status or the pediatric_confirmed_at gate — the request stays
     * pending_verification, now waiting on the PATIENT specifically
     * (dentist_proposed_new_date_at) to accept this date or counter with
     * another, via PatientAppointmentController::acceptProposedDate()/
     * requestDifferentDate().
     */
    public function proposeNewDate(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        if (
            $appointment->status !== 'pending_verification'
            || $appointment->pediatric_confirmed_at !== null
            || ! $appointment->service->isPediatric()
        ) {
            return response()->json([
                'message' => 'Only a pediatric appointment still awaiting review can be given a new date here.',
            ], 422);
        }

        // after:today, not after_or_equal — same-day is blocked specifically
        // for pediatric (it needs a decision window this doesn't leave room
        // for), unlike the general dentist reschedule() this mirrors.
        $validated = $request->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
            'reason' => ['nullable', 'string', 'max:1000'],
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
                'dentist_proposed_new_date_at' => now(),
                'dentist_reschedule_reason' => $validated['reason'] ?? null,
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
            'old_status' => $appointment->status,
            'new_status' => $appointment->status,
            'changed_by' => $request->user()->id,
            'note' => "Pediatric dentist proposed a new date, from {$oldDate} {$oldTime} to {$validated['appointment_date']} {$validated['appointment_time']} — awaiting patient confirmation."
                .(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
        ]);

        $appointment->load(['service:id,name,duration_minutes', 'patient.user', 'dentist:id,name']);
        try {
            Mail::to($appointment->patient->user->email)->send(new AppointmentRescheduledMail($appointment, $oldDate, $oldTime));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => AppointmentRescheduledMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $appointment->patient->user_id,
            'New date proposed',
            "Dr. {$appointment->dentist->name} proposed {$validated['appointment_date']} at {$validated['appointment_time']} for your {$appointment->service->name} visit — please confirm.",
            '/patient/appointments'
        );

        return response()->json(['message' => 'New date sent to the patient for confirmation.', 'data' => $appointment]);
    }
}
