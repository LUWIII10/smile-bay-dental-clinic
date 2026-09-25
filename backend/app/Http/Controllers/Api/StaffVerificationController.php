<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\HmoStatusUpdateMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class StaffVerificationController extends Controller
{
    /**
     * The staff HMO review queue — did not exist before this pass (only the
     * approve/reject action below did). An appointment appears here only
     * once it's genuinely staff-actionable: HMO, still pending, and —
     * critically — if it's a pediatric service, only after the pediatric
     * dentist has already confirmed the slot (pediatric_confirmed_at set).
     * A pediatric HMO booking the pediatric dentist hasn't reviewed yet
     * must NOT show up here, since staff have nothing to verify until the
     * slot itself is confirmed.
     */
    public function index()
    {
        $appointments = Appointment::where('patient_type_snapshot', 'hmo')
            ->where('status', 'pending_verification')
            ->where(function ($query) {
                $query->whereHas('service', fn ($q) => $q->where('is_pediatric', false))
                    ->orWhereNotNull('pediatric_confirmed_at');
            })
            ->with([
                'patient.user:id,email',
                'patient:id,user_id,patient_number,first_name,last_name,hmo_provider_id,hmo_number,hmo_company_name',
                'patient.hmoProvider:id,name',
                'dentist:id,name',
                'service:id,name,duration_minutes',
            ])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Approve or reject a pending_verification HMO appointment. Only valid
     * from that one status — nothing to verify on an already-decided or
     * cash-auto-confirmed row. Rejecting doesn't need a separate "free the
     * slot" step: AppointmentSlotService's OCCUPYING_STATUSES excludes
     * 'rejected', so the slot opens back up the moment the status changes.
     *
     * Pediatric gate added this pass: a pediatric appointment must be
     * confirmed by the pediatric dentist (pediatric_confirmed_at set)
     * before staff may act on it at all, even though its `status` is
     * already 'pending_verification' the whole time — the enum value alone
     * doesn't distinguish "needs pediatric review" from "ready for staff".
     */
    public function verify(Request $request, Appointment $appointment)
    {
        $validated = $request->validate([
            'action' => ['required', 'in:approve,reject'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'Only a pending-verification appointment can be approved or rejected.',
            ], 422);
        }

        if ($appointment->service->isPediatric() && ! $appointment->pediatric_confirmed_at) {
            return response()->json([
                'message' => 'This pediatric appointment must be reviewed by the pediatric dentist before staff can verify it.',
            ], 422);
        }

        $newStatus = $validated['action'] === 'approve' ? 'confirmed' : 'rejected';
        $reason = $validated['action'] === 'reject' ? ($validated['reason'] ?? null) : null;

        DB::transaction(function () use ($appointment, $newStatus, $reason, $request) {
            $appointment->update([
                'status' => $newStatus,
                'verified_by' => $request->user()->id,
                'verified_at' => now(),
                'cancellation_reason' => $reason,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => 'pending_verification',
                'new_status' => $newStatus,
                'changed_by' => $request->user()->id,
                'note' => $newStatus === 'confirmed'
                    ? 'HMO booking approved by staff.'
                    : 'HMO booking rejected by staff.'.($reason ? ' Reason: '.$reason : ''),
            ]);
        });

        // The acting user here is staff, not the patient — unlike
        // AppointmentController::store() (where $request->user() IS the
        // patient), the notification target must come from the appointment's
        // own patient relation instead.
        $appointment->load(['patient.user', 'service', 'dentist']);
        $patientEmail = $appointment->patient->user->email;

        if ($newStatus === 'confirmed') {
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
                "Your HMO coverage was verified — your {$appointment->service->name} appointment is confirmed.",
                '/patient/appointments'
            );
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
                $reason ? "Your booking couldn't be confirmed: {$reason}" : 'Your HMO booking could not be confirmed.',
                '/patient/appointments'
            );
        }

        return response()->json([
            'message' => $newStatus === 'confirmed' ? 'Appointment approved and confirmed.' : 'Appointment rejected.',
            'data' => $appointment,
        ]);
    }

    // What "still pending" can actually mean in practice — staff picks the
    // one that's true right now rather than typing the same handful of
    // phrases freehand every time. Kept here (not a DB-backed lookup table)
    // since it's small, fixed, and only this one action ever offers it.
    public const HMO_STATUS_LABELS = [
        'Ongoing Verification',
        'Awaiting HMO Response',
        'Documents Under Review',
        'Additional Information Needed',
        'Finalizing Approval',
    ];

    /**
     * On-demand "still working on it" update — every other patient-facing
     * message here fires automatically off a real status change
     * (submitted, approved, rejected); this is the one gap where nothing
     * tells the patient anything while their booking just sits in
     * pending_verification, sometimes for days. Staff trigger it manually
     * rather than it firing on some fixed schedule, since "how often is
     * worth reassuring them" is a judgment call, not a timer.
     *
     * Persists to the appointment row itself (hmo_status_label/_note/
     * _updated_at), not just the email/notification — those two are
     * transient (dismissed, archived), so the patient's own "My
     * Appointments" page needs its own durable copy to read back, not just
     * a one-time push.
     */
    public function sendStatusUpdate(Request $request, Appointment $appointment)
    {
        if ($appointment->patient_type_snapshot !== 'hmo' || $appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'A status update only makes sense for an HMO booking still awaiting verification.',
            ], 422);
        }

        $validated = $request->validate([
            'status_label' => ['required', 'string', Rule::in(self::HMO_STATUS_LABELS)],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $appointment->load(['patient.user', 'service', 'dentist']);
        $patientEmail = $appointment->patient->user->email;

        // A walk-in patient registered with no real email (see
        // StaffAppointmentController::registerWalkInPatient()) has a
        // synthesized @walkin.smilebay.local address — sending "an update"
        // there would just silently go nowhere, so this says so up front
        // instead of pretending to have notified anyone.
        if (str_ends_with($patientEmail, '@walkin.smilebay.local')) {
            return response()->json([
                'message' => 'This patient has no email on file — there is nothing to send it to.',
            ], 422);
        }

        $appointment->update([
            'hmo_status_label' => $validated['status_label'],
            'hmo_status_note' => $validated['note'] ?? null,
            'hmo_status_updated_at' => now(),
        ]);

        try {
            Mail::to($patientEmail)->send(new HmoStatusUpdateMail($appointment, $validated['status_label'], $validated['note'] ?? null));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => HmoStatusUpdateMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }

        Notification::notifyUser(
            $appointment->patient->user_id,
            'HMO verification update: '.$validated['status_label'],
            $validated['note'] ?: "We're still verifying your HMO coverage for your {$appointment->service->name} appointment. We'll let you know as soon as it's decided.",
            '/patient/appointments'
        );

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => 'pending_verification',
            'new_status' => 'pending_verification',
            'changed_by' => $request->user()->id,
            'note' => "Status update sent to patient by staff: {$validated['status_label']}.".($validated['note'] ? ' Note: '.$validated['note'] : ''),
        ]);

        return response()->json(['message' => 'Status update sent to the patient.', 'data' => $appointment->fresh()]);
    }

    /**
     * Correct the patient's own HMO details (provider, card number, company
     * name) right from the queue card — a typo caught while staff are
     * looking at it to call the provider shouldn't need a trip to a
     * different page to fix first. Writes to the PATIENT row (hmo_provider_id/
     * hmo_number/hmo_company_name live there, not on the appointment —
     * see StaffVerificationController::index()'s own eager-load), scoped to
     * this one appointment only so staff can't reach this action from
     * anywhere but the queue card it's shown on.
     *
     * Same guard as verify() — only valid while this is still the reason
     * the patient is in the queue at all. Deliberately doesn't touch
     * status/verified_by/pediatric_confirmed_at or anything scheduling-
     * related (service, dentist, date/time) — those are a different,
     * larger change this pass doesn't cover.
     */
    public function updateHmoInfo(Request $request, Appointment $appointment)
    {
        if ($appointment->patient_type_snapshot !== 'hmo' || $appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'HMO details can only be edited for a booking still awaiting verification.',
            ], 422);
        }

        $validated = $request->validate([
            'hmo_provider_id' => ['required', 'integer', Rule::exists('hmo_providers', 'id')->where('is_active', true)],
            'hmo_number' => ['required', 'string', 'max:100'],
            'hmo_company_name' => ['nullable', 'string', 'max:255'],
        ]);

        $patient = $appointment->patient;
        $patient->loadMissing('hmoProvider');
        $oldProviderName = $patient->hmoProvider?->name ?? 'none on file';
        $oldNumber = $patient->hmo_number ?: 'none on file';

        $patient->update($validated);
        $patient->refresh()->loadMissing('hmoProvider');

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => $appointment->status,
            'new_status' => $appointment->status,
            'changed_by' => $request->user()->id,
            'note' => "HMO details corrected by staff — provider: {$oldProviderName} \u{2192} {$patient->hmoProvider?->name}, card #: {$oldNumber} \u{2192} {$patient->hmo_number}.",
        ]);

        $appointment->load(['patient.user', 'patient.hmoProvider', 'dentist', 'service']);

        return response()->json(['message' => 'HMO details updated.', 'data' => $appointment]);
    }
}
