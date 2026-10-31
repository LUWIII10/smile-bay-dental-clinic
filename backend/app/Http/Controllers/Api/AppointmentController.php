<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\AppointmentRescheduledMail;
use App\Mail\HmoBookingSubmittedMail;
use App\Mail\PediatricBookingSubmittedMail;
use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\DentalRecord;
use App\Models\Notification;
use App\Models\Service;
use App\Models\TreatmentHistory;
use App\Models\User;
use App\Services\AppointmentSlotService;
use App\Services\FollowUpRecommendationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class AppointmentController extends Controller
{
    public function __construct(
        private AppointmentSlotService $slots,
        private FollowUpRecommendationService $followUps,
    ) {}

    /**
     * Book a new appointment.
     *
     * Non-pediatric: cash patients are auto-confirmed instantly; HMO
     * patients are saved pending_verification and staff-triaged. Unchanged
     * from before this pass.
     *
     * Pediatric: ALWAYS saved pending_verification regardless of payment
     * method — the pediatric dentist must confirm the slot before it can
     * proceed to (for cash) auto-confirmation or (for HMO) the normal staff
     * queue. See Service::isPediatric() and PediatricVerificationController.
     */
    public function store(StoreAppointmentRequest $request)
    {
        $validated = $request->validated();
        $patient = $request->user()->patient;

        if (! $patient) {
            return response()->json(['message' => 'No patient profile is linked to this account.'], 422);
        }

        // 3-strike cancellation policy (CancellationPolicyService) —
        // self-service booking only. Staff can still book this patient in
        // directly (StaffAppointmentController::assignWalkIn()), since that
        // path is a human staff judgment call, not automated.
        if ($patient->isBookingRestricted()) {
            return response()->json([
                'message' => 'New bookings are currently restricted on this account due to repeated cancellations. Please contact the clinic directly to book an appointment.',
            ], 403);
        }

        $service = Service::findOrFail($validated['service_id']);

        // Clinic-operations rule: a dentist may only be booked for a service
        // they're credentialed for (dentist_services) — most importantly,
        // only the pediatric dentist may take pediatric bookings. Previously
        // unenforced server-side (any active dentist could be paired with
        // any service); added as part of this pass since dentist_services
        // now exists to check against.
        $dentistIsCredentialed = User::where('id', $validated['dentist_id'])
            ->whereHas('services', fn ($q) => $q->where('services.id', $service->id))
            ->exists();

        if (! $dentistIsCredentialed) {
            return response()->json([
                'message' => 'The selected dentist does not offer this service.',
            ], 422);
        }

        $isPediatric = $service->isPediatric();

        // Clinic-operations rule: the pediatric dentist accepts Cash
        // patients only, no HMO — enforced here (not just the booking
        // wizard's own Step 1 warning) since this is the authoritative
        // check every other business rule on this endpoint gets.
        if ($isPediatric && $patient->patient_type === 'hmo') {
            return response()->json([
                'message' => 'Pediatric Dentistry accepts Cash patients only — our pediatric dentist does not accept HMO coverage. Please contact the clinic directly to arrange a Cash visit.',
            ], 422);
        }

        // Every pediatric booking needs the pediatric dentist's manual
        // review before it's real (see the pending_verification below) —
        // same-day leaves no realistic window for that, unlike a regular
        // booking which can auto-confirm (cash) or just join the normal
        // staff queue (HMO) same-day.
        if ($isPediatric && $validated['appointment_date'] === now()->toDateString()) {
            return response()->json([
                'message' => 'Pediatric Dentistry requires advance booking — same-day requests can\'t leave enough time for the pediatric dentist to review. Please choose a later date.',
            ], 422);
        }

        $appointment = DB::transaction(function () use ($validated, $patient, $service, $request, $isPediatric) {
            // Locked lookup/validation first, still inside this same
            // transaction. Two modes — see FollowUpRecommendationService:
            // fulfills_appointment_id present (BookFollowUp.jsx) means this
            // booking MUST consume that exact recommendation, and throws
            // (422, transaction rolled back) if it's already gone; omitted
            // (the regular wizard) means best-effort — consume a match if
            // one exists, otherwise just book normally.
            $recommendation = isset($validated['fulfills_appointment_id'])
                ? $this->followUps->lockAndValidate($validated['fulfills_appointment_id'], $patient->id, $service->id)
                : $this->followUps->findOpenRecommendation($patient->id, $service->id);

            // Re-check availability inside the transaction (with the service's
            // row lock) — the slot grid the patient picked from could be stale
            // by the time they submit, and this is the authoritative check.
            $available = $this->slots->isSlotAvailable(
                $validated['dentist_id'],
                $validated['appointment_date'],
                $validated['appointment_time'],
                $service->duration_minutes,
            );

            if (! $available) {
                return null;
            }

            $status = $isPediatric
                ? 'pending_verification'
                : ($patient->patient_type === 'cash' ? 'confirmed' : 'pending_verification');

            $appointment = Appointment::create([
                'patient_id' => $patient->id,
                'dentist_id' => $validated['dentist_id'],
                'service_id' => $service->id,
                'patient_notes' => $validated['notes'],
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
                'status' => $status,
                'patient_type_snapshot' => $patient->patient_type,
            ]);

            if ($recommendation) {
                $this->followUps->markFulfilled($recommendation, $appointment);
            }

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => null,
                'new_status' => $status,
                'changed_by' => $request->user()->id,
                'note' => $isPediatric ? 'Booked by patient — pediatric, awaiting pediatric review.' : 'Booked by patient.',
            ]);

            return $appointment;
        });

        if (! $appointment) {
            return response()->json([
                'message' => 'This time slot is no longer available. Please choose another.',
            ], 409);
        }

        ActivityLog::record(
            $request->user()->id,
            'appointment_booked',
            "{$request->user()->name} booked a {$service->name} appointment for {$validated['appointment_date']}."
        );

        // Archiving is never permanent by design (see Patient::isArchived()'s
        // own doc comment) — booking again is the clearest possible signal
        // this patient is back, so this silently undoes it here rather than
        // making them (or admin) deal with a stale archived flag no one
        // asked them to notice. Silent on purpose: this isn't a decision
        // worth interrupting the booking flow over.
        if ($patient->isArchived()) {
            $patient->update(['archived_at' => null, 'archived_by' => null, 'archive_reason' => null]);
            ActivityLog::record(
                null,
                'patient_restored',
                "{$request->user()->name}'s patient record was automatically restored from the archive after booking a new appointment."
            );
        }

        if ($isPediatric) {
            // Regardless of cash/HMO — pediatric bookings always need the
            // pediatric dentist's review first, so neither the instant-cash
            // nor the HMO-submitted copy is accurate here.
            try {
                Mail::to($request->user()->email)->send(new PediatricBookingSubmittedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => PediatricBookingSubmittedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyUser(
                $request->user()->id,
                'Booking submitted',
                "Your {$service->name} request is awaiting pediatric review.",
                '/patient/appointments'
            );
            Notification::notifyUser(
                $validated['dentist_id'],
                'Pediatric review needed',
                "New {$service->name} booking from {$patient->first_name} {$patient->last_name} needs your review.",
                '/dentist/pediatric-queue'
            );
        } elseif ($appointment->patient_type_snapshot === 'hmo') {
            try {
                Mail::to($request->user()->email)->send(new HmoBookingSubmittedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => HmoBookingSubmittedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyUser(
                $request->user()->id,
                'Booking submitted',
                'Your HMO booking is pending coverage verification.',
                '/patient/appointments'
            );
            Notification::notifyRolesOnce(
                ['dental_assistant', 'admin'],
                $appointment->id,
                'HMO verification needed',
                "New HMO booking from {$patient->first_name} {$patient->last_name} needs verification."
            );
        } else {
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
                "Your {$service->name} appointment is confirmed.",
                '/patient/appointments'
            );
            // Cash bookings auto-confirm with no staff review step (unlike
            // the pediatric/HMO branches above, which already notify the
            // dentist or staff as part of their own review queue) — without
            // this, the dentist has no way to know a new appointment landed
            // on their schedule until they happen to check it.
            Notification::notifyUser(
                $validated['dentist_id'],
                'New appointment booked',
                "{$patient->first_name} {$patient->last_name} booked {$service->name} on {$appointment->appointment_date->format('M j')} at {$appointment->appointment_time}.",
                '/dentist/schedule'
            );
        }

        $appointment->load(['service:id,name,duration_minutes', 'dentist:id,name']);

        return response()->json([
            'message' => $appointment->status === 'confirmed'
                ? 'Appointment confirmed!'
                : 'Booking request submitted — pending verification.',
            'data' => $appointment,
        ], 201);
    }

    /**
     * Dentist marks their own confirmed appointment as completed after the
     * visit. Only the assigned dentist may do this, and only from
     * 'confirmed' — there's nothing to complete on a pending/cancelled/
     * already-completed row.
     */
    /**
     * Completing an appointment and recording the procedure that was
     * actually performed are one action, not two — a completed appointment
     * with no treatment_history row is exactly the gap this pass closes.
     * Validated, written, and status-changed inside one transaction: if the
     * treatment_history insert fails, the appointment must NOT end up
     * completed with nothing recorded against it, so nothing here commits
     * unless all of it succeeds.
     */
    public function complete(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        if ($appointment->status !== 'confirmed') {
            return response()->json([
                'message' => 'Only a confirmed appointment can be marked completed.',
            ], 422);
        }

        $validated = $request->validate([
            'procedure_name' => ['required', 'string', 'max:255'],
            'tooth_number' => ['nullable', 'integer', 'between:1,32'],
            'performed_at' => ['required', 'date'],
            // No min length — a genuinely brief note ("N/A", "No issues
            // noted") is a real clinical judgment call, not a shortcut to
            // guard against. A fixed character count can't tell a padded,
            // meaningless note from a real short one anyway; this trusts
            // the dentist the same way the rest of the record already does.
            'notes' => ['required', 'string', 'max:1000'],
            // Optional — the dentist flagging a follow-up right here, while
            // the visit is still fresh in mind, instead of staff having to
            // infer one from these notes later. Does NOT activate it for
            // the patient on its own: it only pre-fills what staff see on
            // "Enable Follow-up" (AppointmentDetailModal.jsx), who still
            // review and click that button themselves, same as today.
            'recommend_follow_up_service_id' => ['nullable', 'integer', 'exists:services,id'],
            'recommend_follow_up_window' => ['nullable', Rule::in(Appointment::FOLLOW_UP_WINDOWS)],
        ]);

        $primaryDentistJustAssigned = false;

        $suggestedServiceId = $validated['recommend_follow_up_service_id'] ?? null;

        DB::transaction(function () use ($appointment, $request, $validated, $suggestedServiceId, &$primaryDentistJustAssigned) {
            $appointment->update([
                'status' => 'completed',
                'dentist_suggested_follow_up_service_id' => $suggestedServiceId,
                'dentist_suggested_follow_up_window' => $suggestedServiceId ? ($validated['recommend_follow_up_window'] ?? null) : null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => 'confirmed',
                'new_status' => 'completed',
                'changed_by' => $request->user()->id,
                'note' => 'Marked completed by dentist.',
            ]);

            // Lazily provisioned exactly like PatientDentalRecordController::
            // show() — dental_records isn't created at registration, so a
            // patient whose first-ever appointment is the one being
            // completed here may not have a row yet. Same two-step shape:
            // record_number is NOT NULL + unique with no default, and the id
            // it's derived from only exists once the row itself is inserted.
            $record = $appointment->patient->dentalRecord;
            if (! $record) {
                $record = DentalRecord::create([
                    'patient_id' => $appointment->patient_id,
                    'opened_at' => now(),
                    'record_number' => 'PENDING-'.$appointment->patient_id,
                ]);
                $record->update(['record_number' => DentalRecord::formatRecordNumber($record->id, $record->opened_at)]);
            }

            $primaryDentistJustAssigned = $this->assignPrimaryDentistIfUnset($record, $appointment->dentist_id);

            TreatmentHistory::create([
                'dental_record_id' => $record->id,
                'appointment_id' => $appointment->id,
                'tooth_number' => $validated['tooth_number'] ?? null,
                'procedure_name' => $validated['procedure_name'],
                'performed_by' => $request->user()->id,
                'performed_at' => $validated['performed_at'],
                'notes' => $validated['notes'],
            ]);
        });

        Notification::notifyUser(
            $appointment->patient->user_id,
            'Visit completed',
            "Your {$appointment->service->name} visit has been logged. View the details in your dental records.",
            '/patient/dental-records'
        );

        if ($primaryDentistJustAssigned) {
            Notification::notifyUser(
                $appointment->patient->user_id,
                'Primary dentist assigned',
                "{$appointment->dentist->name} is now your primary dentist.",
                '/patient/dental-records'
            );
        }

        // Staff doesn't see this until they happen to open this specific
        // appointment's detail — broadcasts it immediately instead, so a
        // suggestion surfaces right away rather than only being found by
        // browsing completed visits one at a time. Deliberately
        // notifyRoles(), not notifyRolesOnce(): that one's dedup is keyed
        // only by appointment_id, and this same appointment may already
        // have an unrelated notification on file from earlier in its
        // lifecycle (e.g. a pediatric "HMO verification needed" broadcast)
        // — using it here could silently skip this one. complete() can
        // only ever run once per appointment anyway (status guard above),
        // so no dedup is needed.
        if ($suggestedServiceId) {
            Notification::notifyRoles(
                ['dental_assistant', 'admin'],
                'Follow-up Suggested',
                "{$request->user()->name} suggested a {$appointment->dentistSuggestedFollowUpService->name} follow-up for {$appointment->patient->first_name} {$appointment->patient->last_name} — review and enable it."
            );
        }

        $appointment->load([
            'service:id,name,duration_minutes',
            'patient:id,patient_number,first_name,last_name',
            'treatmentHistoryEntry',
        ]);

        ActivityLog::record(
            $request->user()->id,
            'appointment_completed',
            "{$request->user()->name} marked {$appointment->patient->first_name} {$appointment->patient->last_name}'s {$appointment->service->name} appointment as completed."
        );

        return response()->json(['message' => 'Appointment marked as completed.', 'data' => $appointment]);
    }

    /**
     * Retroactively logs what was actually done for an appointment that's
     * already marked completed but has no treatment_history row — visits
     * completed before this per-visit record was required, or one the
     * dentist genuinely never wrote up. Deliberately separate from
     * complete() above (which also transitions status) rather than loosening
     * complete()'s own status check: this never touches `status` (already
     * 'completed'), and only ever fires once per appointment — an existing
     * record is never overwritten, so a dentist can't use this to quietly
     * rewrite history.
     */
    public function backfillRecord(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        if ($appointment->status !== 'completed') {
            return response()->json([
                'message' => 'Only a completed appointment can have its treatment record added.',
            ], 422);
        }

        if ($appointment->treatmentHistoryEntry()->exists()) {
            return response()->json([
                'message' => 'This visit already has a treatment record on file.',
            ], 422);
        }

        $validated = $request->validate([
            'procedure_name' => ['required', 'string', 'max:255'],
            'tooth_number' => ['nullable', 'integer', 'between:1,32'],
            'performed_at' => ['required', 'date'],
            // Same reasoning as complete() above — no min length.
            'notes' => ['required', 'string', 'max:1000'],
        ]);

        $primaryDentistJustAssigned = false;

        DB::transaction(function () use ($appointment, $request, $validated, &$primaryDentistJustAssigned) {
            // Same lazy-provisioning shape as complete() above — a patient
            // whose only appointment is this one may still have no
            // dental_records row yet.
            $record = $appointment->patient->dentalRecord;
            if (! $record) {
                $record = DentalRecord::create([
                    'patient_id' => $appointment->patient_id,
                    'opened_at' => now(),
                    'record_number' => 'PENDING-'.$appointment->patient_id,
                ]);
                $record->update(['record_number' => DentalRecord::formatRecordNumber($record->id, $record->opened_at)]);
            }

            $primaryDentistJustAssigned = $this->assignPrimaryDentistIfUnset($record, $appointment->dentist_id);

            TreatmentHistory::create([
                'dental_record_id' => $record->id,
                'appointment_id' => $appointment->id,
                'tooth_number' => $validated['tooth_number'] ?? null,
                'procedure_name' => $validated['procedure_name'],
                'performed_by' => $request->user()->id,
                'performed_at' => $validated['performed_at'],
                'notes' => $validated['notes'],
            ]);
        });

        if ($primaryDentistJustAssigned) {
            Notification::notifyUser(
                $appointment->patient->user_id,
                'Primary dentist assigned',
                "{$appointment->dentist->name} is now your primary dentist.",
                '/patient/dental-records'
            );
        }

        $appointment->load([
            'service:id,name,duration_minutes',
            'patient:id,patient_number,first_name,last_name',
            'treatmentHistoryEntry',
        ]);

        return response()->json(['message' => 'Treatment record added.', 'data' => $appointment]);
    }

    /**
     * Dentist proposes moving one of their own appointments to a new
     * date/time — does NOT apply it directly. Unlike
     * StaffAppointmentController::reschedule() ("Move to Next Open Slot",
     * same-day and time-critical for a running-late patient, so it still
     * commits instantly), this one is typically not urgent, so the patient
     * gets a say: it sets the same dentist_proposed_new_date_at/
     * dentist_reschedule_reason columns PediatricVerificationController/
     * StaffVerificationController's own proposeNewDate() use, optimistically
     * writing the proposed date/time onto the appointment exactly like those
     * do. Ownership-scoped exactly like complete() above. Re-validates via
     * AppointmentSlotService::isSlotAvailable(), excluding the appointment's
     * own current slot (it always "conflicts" with itself otherwise) — same
     * lockForUpdate-protected re-check every other slot-consuming action in
     * this app does, never trusting that the slot the dentist picked client-
     * side is still actually free. See
     * PatientAppointmentController::acceptReschedule()/
     * requestDifferentRescheduleDate() for what happens once the patient
     * responds — both are scoped to status === 'confirmed' specifically, so
     * they can never collide with the pending_verification-only propose
     * flows above.
     */
    public function proposeReschedule(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        if (! in_array($appointment->status, ['confirmed', 'pending_verification'], true)) {
            return response()->json([
                'message' => 'Only a confirmed or pending appointment can be rescheduled.',
            ], 422);
        }

        $validated = $request->validate([
            'appointment_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'appointment_time' => ['required', 'date_format:H:i'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $appointment->load('service:id,duration_minutes');
        $oldDate = $appointment->appointment_date->toDateString();
        $oldTime = $appointment->appointment_time;

        $proposed = DB::transaction(function () use ($appointment, $validated) {
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

        if (! $proposed) {
            return response()->json([
                'message' => 'This time slot is no longer available. Please choose another.',
            ], 409);
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => $appointment->status,
            'new_status' => $appointment->status,
            'changed_by' => $request->user()->id,
            'note' => "Dentist proposed a new date, from {$oldDate} {$oldTime} to {$validated['appointment_date']} {$validated['appointment_time']} — awaiting patient confirmation."
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
            'New time proposed',
            "Dr. {$appointment->dentist->name} proposed moving your {$appointment->service->name} appointment to {$validated['appointment_date']} at {$validated['appointment_time']} — please confirm.",
            '/patient/appointments'
        );

        ActivityLog::record(
            $request->user()->id,
            'appointment_rescheduled',
            "{$request->user()->name} proposed a new date for {$appointment->patient->first_name} {$appointment->patient->last_name}'s {$appointment->service->name} appointment."
        );

        return response()->json(['message' => 'New date sent to the patient for confirmation.', 'data' => $appointment]);
    }

    /**
     * Dentist cancels one of their own appointments. Same ownership scoping
     * as complete()/reschedule() above; the actual cancel logic mirrors
     * StaffAppointmentController::cancel() (same status guard, same
     * cancellation_reason field, same notification email) since it's the
     * same real-world action — only who's allowed to trigger it differs.
     */
    public function cancel(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! in_array($appointment->status, ['confirmed', 'pending_verification'], true)) {
            return response()->json([
                'message' => 'Only a confirmed or pending appointment can be cancelled.',
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
                'note' => 'Cancelled by dentist.'.(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
            ]);
        });

        $appointment->load(['patient.user', 'dentist:id,name', 'service:id,name']);
        try {
            Mail::to($appointment->patient->user->email)->send(new AppointmentRejectedMail($appointment, $validated['reason'] ?? null));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => AppointmentRejectedMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $appointment->patient->user_id,
            'Appointment cancelled',
            'Your '.$appointment->service->name.' appointment was cancelled by the clinic.'
                .(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
            '/patient/appointments'
        );

        ActivityLog::record(
            $request->user()->id,
            'appointment_cancelled',
            "{$request->user()->name} cancelled {$appointment->patient->first_name} {$appointment->patient->last_name}'s {$appointment->service->name} appointment."
        );

        return response()->json(['message' => 'Appointment cancelled.', 'data' => $appointment]);
    }

    /**
     * Whichever dentist first actually completes a visit becomes the
     * patient's primary dentist by default — never overwrites an existing
     * value, so this only ever fires once per patient (their first
     * completed appointment, through either complete() or
     * backfillRecord()) and staff can still reassign it afterward via
     * PatientRecordController::updatePrimaryDentist(). Returns whether it
     * just assigned one — both call sites use that to notify the patient
     * only on an actual (first-time) assignment, after their own
     * transaction commits, not on every call.
     */
    private function assignPrimaryDentistIfUnset(DentalRecord $record, int $dentistId): bool
    {
        if (! $record->primary_dentist_id) {
            $record->update(['primary_dentist_id' => $dentistId]);

            return true;
        }

        return false;
    }
}
