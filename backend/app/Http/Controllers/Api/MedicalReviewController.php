<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * The assigned dentist's own clinical-safety review queue — separate from
 * StaffVerificationController (HMO coverage, staff) and
 * PediatricVerificationController (the pediatric dentist's own slot
 * confirmation). This one exists because ClinicalSafetyService flagged a
 * conflict between the patient's Medical Record answers and the booked
 * service (e.g. pregnancy + an X-ray) — only the dentist who'd actually
 * perform the procedure makes this call, never dental_assistant/admin.
 */
class MedicalReviewController extends Controller
{
    /**
     * This dentist's own bookings still awaiting their clinical-safety
     * call. Same dentist_id-scoping reasoning as
     * PediatricVerificationController::index() — a flagged booking is
     * only ever assigned to the dentist who'd perform it.
     */
    public function index(Request $request)
    {
        $appointments = Appointment::awaitingMedicalReview($request->user()->id)
            ->with([
                'patient:id,patient_number,first_name,last_name',
                'service:id,name,duration_minutes,involves_xray,involves_sedation,is_surgical',
                'medicalRecord',
            ])
            ->orderBy('appointment_date')
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Four outcomes, one endpoint — suggest_alternative/reschedule_later
     * are represented as distinct reasons rather than full sub-flows (no
     * alternate-procedure picker or reschedule-date picker here): each
     * just tailors the patient-facing message and leaves rebooking to the
     * patient, same as how a plain "contact the clinic" rejection already
     * works elsewhere in this app.
     */
    public function decide(Request $request, Appointment $appointment)
    {
        if ($appointment->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This appointment is not assigned to you.'], 403);
        }

        if (! $appointment->medical_review_required || $appointment->medical_review_status !== 'pending') {
            return response()->json([
                'message' => 'Only an appointment awaiting clinical review can be decided here.',
            ], 422);
        }

        $validated = $request->validate([
            'action' => ['required', 'in:approve,suggest_alternative,reschedule_later,decline'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $isApprove = $validated['action'] === 'approve';

        DB::transaction(function () use ($appointment, $validated, $isApprove, $request) {
            $appointment->update([
                'medical_review_status' => $isApprove ? 'approved' : 'declined',
                'medical_review_action' => $isApprove ? 'approved_as_scheduled' : $validated['action'],
                'medical_review_notes' => $validated['notes'] ?? null,
                'medical_reviewed_by' => $request->user()->id,
                'medical_reviewed_at' => now(),
                // Approved: proceed exactly as this booking would have
                // without the flag — cash auto-confirms, HMO still needs
                // staff coverage verification. Declined (any reason):
                // rejected outright, same terminal state the patient
                // already understands from any other rejected booking.
                'status' => $isApprove
                    ? ($appointment->patient_type_snapshot === 'cash' ? 'confirmed' : 'pending_verification')
                    : 'rejected',
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => 'pending_verification',
                'new_status' => $appointment->status,
                'changed_by' => $request->user()->id,
                'note' => 'Clinical review: '.$validated['action'].($validated['notes'] ?? null ? ' — '.$validated['notes'] : ''),
            ]);
        });

        $appointment->load(['patient.user', 'service', 'dentist']);
        $patientEmail = $appointment->patient->user->email;

        if ($isApprove) {
            if ($appointment->status === 'confirmed') {
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
                Notification::notifyUser(
                    $appointment->patient->user_id,
                    'Cleared for coverage verification',
                    "Your dentist cleared your {$appointment->service->name} booking — it now moves to HMO coverage verification.",
                    '/patient/appointments'
                );
                Notification::notifyRolesOnce(
                    ['dental_assistant', 'admin'],
                    $appointment->id,
                    'HMO verification needed',
                    "{$appointment->patient->first_name} {$appointment->patient->last_name}'s booking cleared clinical review and now needs HMO verification."
                );
            }
        } else {
            $patientMessages = [
                'suggest_alternative' => "Your dentist suggests a different procedure than {$appointment->service->name} given your health information. Please contact the clinic or book a different service.",
                'reschedule_later' => "Your dentist recommends rescheduling your {$appointment->service->name} appointment for later, given your health information. Please book again when ready.",
                'decline' => "Your dentist could not confirm your {$appointment->service->name} appointment as requested, given your health information. Please contact the clinic directly.",
            ];
            $reason = $patientMessages[$validated['action']] ?? $patientMessages['decline'];

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
                'Appointment needs a change',
                $reason,
                '/patient/appointments'
            );
        }

        ActivityLog::record(
            $request->user()->id,
            $isApprove ? 'medical_review_approved' : 'medical_review_declined',
            "{$request->user()->name} ".($isApprove ? 'cleared' : 'did not clear')." {$appointment->patient->first_name} {$appointment->patient->last_name}'s {$appointment->service->name} booking after clinical review."
        );

        return response()->json([
            'message' => $isApprove ? 'Booking cleared.' : 'Patient notified.',
            'data' => $appointment,
        ]);
    }
}
