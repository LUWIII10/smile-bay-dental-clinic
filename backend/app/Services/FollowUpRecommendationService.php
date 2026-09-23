<?php

namespace App\Services;

use App\Models\Appointment;
use Illuminate\Validation\ValidationException;

/**
 * Guards the "one recommendation, consumed exactly once" rule for the
 * "Book a Follow-up" feature. Two independent booking paths can end up
 * fulfilling the same recommendation — the patient's own wizard
 * (AppointmentController::store()) and staff's walk-in tool
 * (StaffAppointmentController::assignWalkIn()) — so both call into this
 * service, inside their own DB::transaction, so whichever commits first
 * locks and consumes it.
 *
 * Two lookup modes, both row-locked:
 * - findOpenRecommendation() — silent, best-effort. Used by the regular
 *   booking flow and by staff's walk-in tool, neither of which is
 *   necessarily "about" a recommendation: if one happens to match
 *   (patient, service), it's consumed; if not, the booking still proceeds
 *   as an ordinary appointment. Never blocks a booking that wasn't trying
 *   to use a recommendation in the first place.
 * - lockAndValidate() — strict. Used only by BookFollowUp.jsx, the one
 *   screen that exists specifically to fulfill a named recommendation: if
 *   it's gone (already booked elsewhere in the meantime — e.g. staff on the
 *   phone), this throws instead of silently letting the booking through as
 *   an unrelated, duplicate appointment for the same procedure.
 */
class FollowUpRecommendationService
{
    public function findOpenRecommendation(int $patientId, int $serviceId): ?Appointment
    {
        return Appointment::query()
            ->withOpenFollowUpRecommendation()
            ->where('patient_id', $patientId)
            ->where('recommended_follow_up_service_id', $serviceId)
            ->lockForUpdate()
            ->first();
    }

    public function lockAndValidate(int $fulfillsAppointmentId, int $patientId, int $serviceId): Appointment
    {
        $source = Appointment::query()
            ->where('id', $fulfillsAppointmentId)
            ->lockForUpdate()
            ->first();

        if (! $source
            || $source->patient_id !== $patientId
            || $source->recommended_follow_up_service_id !== $serviceId
            || $source->follow_up_fulfilled_at !== null
        ) {
            throw ValidationException::withMessages([
                'fulfills_appointment_id' => 'This follow-up has already been scheduled, or is no longer available.',
            ]);
        }

        return $source;
    }

    public function markFulfilled(Appointment $source, Appointment $newAppointment): void
    {
        $source->update(['follow_up_fulfilled_at' => now()]);
        $newAppointment->update(['fulfills_appointment_id' => $source->id]);
    }
}
