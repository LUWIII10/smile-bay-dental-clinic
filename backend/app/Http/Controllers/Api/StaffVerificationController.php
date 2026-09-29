<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\HmoCoverageVerifiedMail;
use App\Mail\HmoStatusUpdateMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentSlotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class StaffVerificationController extends Controller
{
    public function __construct(private AppointmentSlotService $slots) {}

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

        // A booking whose requested date has already passed can't be
        // confirmed onto that date — verification here often takes days, so
        // this is a routine case, not an edge case. proposeNewDate() below
        // is the "approve, but the patient needs a new date" path instead;
        // it marks coverage verified the same way this does, just without
        // jumping straight to 'confirmed'.
        if (
            $validated['action'] === 'approve'
            && $appointment->appointment_date->toDateString() < now()->toDateString()
        ) {
            return response()->json([
                'message' => 'This booking\'s requested date has already passed — use "Approve & Reschedule" to verify coverage and propose a new date instead.',
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

    /**
     * Staff approves HMO coverage for a booking whose requested date has
     * already passed — the same "coverage verified" event verify()'s
     * approve branch represents, just without a still-valid date to confirm
     * onto. Sets verified_by/verified_at exactly like a normal approval
     * (coverage IS verified from this point on) plus
     * dentist_proposed_new_date_at/dentist_reschedule_reason — reusing the
     * same columns PediatricVerificationController::proposeNewDate() uses
     * for its own "patient must respond" shape — so the appointment stays
     * pending_verification, now in a third sub-state: coverage verified,
     * only the date needs the patient's own confirmation. See
     * PatientAppointmentController::acceptStaffProposedDate() /
     * requestDifferentDateForVerifiedHmo() for what happens once they
     * respond — unlike the pediatric flow's own accept/counter, both of
     * those go straight to 'confirmed', since there's no further
     * verification left to wait on once coverage is already verified here.
     *
     * hmo_coverage_notes is optional, same as updateHmoInfo()'s own copy of
     * this field — staff may not have the detailed benefit breakdown yet, or
     * may prefer to record it separately via Edit Info. Only overwrites the
     * patient's stored notes (and bumps hmo_coverage_verified_at) when
     * non-blank text actually different from what's on file is sent, so an
     * empty submission never wipes a previously-recorded note.
     */
    public function proposeNewDate(Request $request, Appointment $appointment)
    {
        if ($appointment->patient_type_snapshot !== 'hmo' || $appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'Only an HMO booking still awaiting verification can be given a new date here.',
            ], 422);
        }

        if ($appointment->service->isPediatric() && ! $appointment->pediatric_confirmed_at) {
            return response()->json([
                'message' => 'This pediatric appointment must be reviewed by the pediatric dentist before staff can verify it.',
            ], 422);
        }

        $validated = $request->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'hmo_coverage_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $appointment->load('service:id,duration_minutes,is_pediatric');
        $oldDate = $appointment->appointment_date->toDateString();
        $oldTime = $appointment->appointment_time;

        $patient = $appointment->patient;
        $coverageNotesChanged = ! empty(trim((string) ($validated['hmo_coverage_notes'] ?? '')))
            && trim((string) $validated['hmo_coverage_notes']) !== trim((string) $patient->hmo_coverage_notes);

        $moved = DB::transaction(function () use ($appointment, $validated, $request, $patient, $coverageNotesChanged) {
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
                'verified_by' => $request->user()->id,
                'verified_at' => now(),
            ]);

            if ($coverageNotesChanged) {
                $patient->update([
                    'hmo_coverage_notes' => trim($validated['hmo_coverage_notes']),
                    'hmo_coverage_verified_at' => now(),
                ]);
            }

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
            'note' => "Staff verified HMO coverage and proposed a new date, from {$oldDate} {$oldTime} to {$validated['appointment_date']} {$validated['appointment_time']} — awaiting patient confirmation."
                .(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
        ]);

        $appointment->load(['patient.user', 'patient.hmoProvider', 'service:id,name,duration_minutes', 'dentist:id,name']);
        try {
            Mail::to($appointment->patient->user->email)->send(new HmoCoverageVerifiedMail($appointment));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => HmoCoverageVerifiedMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $appointment->patient->user_id,
            'HMO coverage verified — confirm your new date',
            "Your {$appointment->service->name} coverage was verified. We proposed {$validated['appointment_date']} at {$validated['appointment_time']} since your original date already passed — please confirm.",
            '/patient/appointments'
        );

        return response()->json([
            'message' => 'Coverage verified — new date sent to the patient for confirmation.',
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
     * Correct anything shown on the queue card — HMO details (provider, card
     * number, company name, on the PATIENT row) as well as the appointment's
     * own service/dentist/date/time — right from the card, since a typo or a
     * miscommunicated slot caught while staff are looking at it shouldn't
     * need a trip to a different page to fix first. Every field is required
     * on every save (the modal always resubmits the full current state, not
     * a partial patch) so this stays one predictable "save everything shown"
     * action rather than needing to reason about which subset changed.
     *
     * Same guard as verify() — only valid while this is still the reason the
     * patient is in the queue at all. Re-validates the new service/dentist/
     * slot with the exact same rules real booking goes through (credentialing,
     * pediatric-is-cash-only, real slot availability excluding this
     * appointment's own current slot) — never trusts the dropdown values
     * alone, same reasoning as every other slot-consuming action in this app.
     */
    public function updateHmoInfo(Request $request, Appointment $appointment)
    {
        if ($appointment->patient_type_snapshot !== 'hmo' || $appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'This booking can only be edited while still awaiting verification.',
            ], 422);
        }

        $validated = $request->validate([
            'hmo_provider_id' => ['required', 'integer', Rule::exists('hmo_providers', 'id')->where('is_active', true)],
            'hmo_number' => ['required', 'string', 'max:100'],
            'hmo_company_name' => ['nullable', 'string', 'max:255'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'dentist_id' => ['required', 'integer', Rule::exists('users', 'id')->where('role', 'dentist')],
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
            // Optional and decoupled from Approve/Reject — staff may learn
            // the patient's benefit details at any point while this card is
            // still in the queue, not only at the moment they approve. Same
            // "only overwrites on real, non-blank, changed text" rule as
            // proposeNewDate()'s own copy of this field, so opening this
            // modal to fix, say, just the card number never blanks out a
            // note already on file.
            'hmo_coverage_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $service = Service::findOrFail($validated['service_id']);

        // Same credentialing rule AppointmentController::store() enforces at
        // booking time — reassigning to a dentist who doesn't offer this
        // service would silently produce a booking that could never
        // actually happen.
        $dentistIsCredentialed = User::where('id', $validated['dentist_id'])
            ->whereHas('services', fn ($q) => $q->where('services.id', $service->id))
            ->exists();

        if (! $dentistIsCredentialed) {
            return response()->json(['message' => 'The selected dentist does not offer this service.'], 422);
        }

        // This entire queue is HMO-only (see index()) — the pediatric
        // dentist accepts Cash only, so switching to a pediatric service
        // here would produce a booking that violates that rule the moment
        // it's saved.
        if ($service->isPediatric()) {
            return response()->json([
                'message' => 'Pediatric Dentistry accepts Cash patients only — this HMO booking cannot be reassigned to a pediatric service.',
            ], 422);
        }

        $patient = $appointment->patient;
        $patient->loadMissing('hmoProvider');
        $oldProviderName = $patient->hmoProvider?->name ?? 'none on file';
        $oldNumber = $patient->hmo_number ?: 'none on file';
        $oldServiceName = $appointment->service->name ?? 'unknown service';
        $oldDentistName = $appointment->dentist->name ?? 'unassigned';
        $oldDate = $appointment->appointment_date->toDateString();
        $oldTime = $appointment->appointment_time;

        $serviceChanged = $service->id !== $appointment->service_id;
        $scheduleChanged = $serviceChanged
            || $validated['dentist_id'] !== $appointment->dentist_id
            || $validated['appointment_date'] !== $oldDate
            || $validated['appointment_time'] !== substr($oldTime, 0, 5);
        $coverageNotesChanged = ! empty(trim((string) ($validated['hmo_coverage_notes'] ?? '')))
            && trim((string) $validated['hmo_coverage_notes']) !== trim((string) $patient->hmo_coverage_notes);

        $saved = DB::transaction(function () use ($appointment, $service, $validated, $scheduleChanged, $coverageNotesChanged) {
            // Only re-check the slot when something that affects it actually
            // changed — re-validating an unchanged slot is harmless, but
            // skipping it when nothing moved avoids a spurious 409 from the
            // appointment's own row locking itself out of its own count.
            if ($scheduleChanged) {
                $available = $this->slots->isSlotAvailable(
                    $validated['dentist_id'],
                    $validated['appointment_date'],
                    $validated['appointment_time'],
                    $service->duration_minutes,
                    $appointment->id,
                );

                if (! $available) {
                    return false;
                }
            }

            $appointment->update([
                'service_id' => $service->id,
                'dentist_id' => $validated['dentist_id'],
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
            ]);

            $appointment->patient->update([
                'hmo_provider_id' => $validated['hmo_provider_id'],
                'hmo_number' => $validated['hmo_number'],
                'hmo_company_name' => $validated['hmo_company_name'],
                ...($coverageNotesChanged ? [
                    'hmo_coverage_notes' => trim($validated['hmo_coverage_notes']),
                    'hmo_coverage_verified_at' => now(),
                ] : []),
            ]);

            return true;
        });

        if (! $saved) {
            return response()->json([
                'message' => 'That time slot is no longer available. Please choose another.',
            ], 409);
        }

        $patient->refresh()->loadMissing('hmoProvider');
        $appointment->refresh()->load(['patient.user', 'patient.hmoProvider', 'dentist', 'service']);

        $logLines = [
            "provider: {$oldProviderName} \u{2192} {$patient->hmoProvider?->name}",
            "card #: {$oldNumber} \u{2192} {$patient->hmo_number}",
        ];
        if ($scheduleChanged) {
            $logLines[] = "service: {$oldServiceName} \u{2192} {$appointment->service->name}";
            $logLines[] = "dentist: {$oldDentistName} \u{2192} {$appointment->dentist->name}";
            $logLines[] = "schedule: {$oldDate} {$oldTime} \u{2192} {$appointment->appointment_date->toDateString()} {$appointment->appointment_time}";
        }
        if ($coverageNotesChanged) {
            $logLines[] = 'coverage details updated';
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => $appointment->status,
            'new_status' => $appointment->status,
            'changed_by' => $request->user()->id,
            'note' => 'Booking details corrected by staff — '.implode(', ', $logLines).'.',
        ]);

        return response()->json(['message' => 'Booking details updated.', 'data' => $appointment]);
    }

    /**
     * Backs the "Edit Info" modal's time-slot picker — same real
     * AppointmentSlotService math the patient booking wizard and the
     * dentist's own RescheduleModal use, with one difference: this
     * appointment's OWN current slot counts as free instead of
     * self-conflicting (see AppointmentSlotService::getAvailableSlots()'s
     * $excludeAppointmentId), so editing just the HMO info without touching
     * the schedule doesn't require re-picking a time first.
     */
    public function availableSlotsForEdit(Request $request, Appointment $appointment)
    {
        if ($appointment->patient_type_snapshot !== 'hmo' || $appointment->status !== 'pending_verification') {
            return response()->json([
                'message' => 'This booking can only be edited while still awaiting verification.',
            ], 422);
        }

        $validated = $request->validate([
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'dentist_id' => ['required', 'integer', 'exists:users,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
        ]);

        $service = Service::findOrFail($validated['service_id']);

        $slots = $this->slots->getAvailableSlots(
            $validated['dentist_id'],
            $validated['date'],
            $service->duration_minutes,
            $appointment->id,
        );

        return response()->json([
            'data' => ['slots' => array_map(fn ($slot) => $slot->format('H:i'), $slots)],
        ]);
    }
}
