<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\AppointmentRescheduledMail;
use App\Mail\HmoBookingSubmittedMail;
use App\Mail\PediatricBookingSubmittedMail;
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

class AppointmentController extends Controller
{
    public function __construct(private AppointmentSlotService $slots) {}

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

        $appointment = DB::transaction(function () use ($validated, $patient, $service, $request, $isPediatric) {
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
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
                'status' => $status,
                'patient_type_snapshot' => $patient->patient_type,
            ]);

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

        DB::transaction(function () use ($appointment, $request) {
            $appointment->update(['status' => 'completed']);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => 'confirmed',
                'new_status' => 'completed',
                'changed_by' => $request->user()->id,
                'note' => 'Marked completed by dentist.',
            ]);
        });

        $appointment->load(['service:id,name,duration_minutes', 'patient:id,patient_number,first_name,last_name']);

        return response()->json(['message' => 'Appointment marked as completed.', 'data' => $appointment]);
    }

    /**
     * Dentist moves one of their own appointments to a new date/time.
     * Ownership-scoped exactly like complete() above. Re-validates via
     * AppointmentSlotService::isSlotAvailable(), excluding the appointment's
     * own current slot (it always "conflicts" with itself otherwise) — same
     * lockForUpdate-protected re-check every other slot-consuming action in
     * this app does, never trusting that the slot the dentist picked client-
     * side is still actually free.
     */
    public function reschedule(Request $request, Appointment $appointment)
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
        ]);

        $appointment->load('service:id,duration_minutes');
        $oldDate = $appointment->appointment_date->toDateString();
        $oldTime = $appointment->appointment_time;

        $rescheduled = DB::transaction(function () use ($appointment, $validated) {
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
            ]);

            return true;
        });

        if (! $rescheduled) {
            return response()->json([
                'message' => 'This time slot is no longer available. Please choose another.',
            ], 409);
        }

        AppointmentStatusLog::create([
            'appointment_id' => $appointment->id,
            'old_status' => $appointment->status,
            'new_status' => $appointment->status,
            'changed_by' => $request->user()->id,
            'note' => "Rescheduled by dentist from {$oldDate} {$oldTime} to {$validated['appointment_date']} {$validated['appointment_time']}.",
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
            'Appointment rescheduled',
            "Your {$appointment->service->name} appointment moved to {$validated['appointment_date']} at {$validated['appointment_time']}.",
            '/patient/appointments'
        );

        return response()->json(['message' => 'Appointment rescheduled.', 'data' => $appointment]);
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

        return response()->json(['message' => 'Appointment cancelled.', 'data' => $appointment]);
    }
}
