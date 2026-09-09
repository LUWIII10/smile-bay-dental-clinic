<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
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
    /**
     * Appointments assigned to the logged-in pediatric dentist that are
     * still awaiting their review. role:dentist is shared by every dentist
     * account, but scoping to dentist_id = auth user means a non-pediatric
     * dentist simply sees an empty queue — pediatric appointments are only
     * ever assigned to the pediatric dentist (enforced in
     * AppointmentController::store() via the dentist_services check).
     */
    public function index(Request $request)
    {
        $appointments = Appointment::where('dentist_id', $request->user()->id)
            ->where('status', 'pending_verification')
            ->whereNull('pediatric_confirmed_at')
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

        if ($appointment->status !== 'pending_verification' || $appointment->pediatric_confirmed_at !== null) {
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
}
