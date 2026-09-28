<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Notification;
use App\Models\Patient;

/**
 * The "3-strike" self-cancellation policy: cash patients auto-confirm with
 * no down payment, so nothing else in the system discourages booking
 * repeatedly and cancelling instead of showing up. Only ever counts
 * patient-initiated cancellations (appointments.status = 'cancelled') —
 * never 'rejected' (staff-initiated, e.g. an HMO coverage issue), which
 * isn't the patient's doing.
 *
 * Two escalating, automatic consequences — deliberately not a single jump
 * straight to deactivation:
 * - WARNING_THRESHOLD: informational only (statusFor(), read anywhere) —
 *   fires starting on the 1st cancellation, so the patient sees a notice
 *   every time from then on, not just once right before the cutoff.
 * - RESTRICTION_THRESHOLD: Patient::booking_restricted_at gets set — blocks
 *   new self-service bookings (AppointmentController::store()) but the
 *   account otherwise works normally (can still log in, view records,
 *   staff can still book them by phone — see StaffAppointmentController::
 *   assignWalkIn(), deliberately NOT gated by this).
 * - Cancelling again after already being restricted escalates once more,
 *   to users.status = 'inactive' (the app's one existing, already-proven
 *   account-disable mechanism — see UserManagementController).
 *
 * restriction_count (separate from booking_restricted_at, which gets
 * cleared every time an admin lifts it) only ever increases, once per
 * actual restriction event — so a patient who was restricted, lifted, then
 * restricted again later shows that history instead of reading as a
 * first-time case each time.
 */
class CancellationPolicyService
{
    private const WARNING_THRESHOLD = 1;

    private const RESTRICTION_THRESHOLD = 3;

    public function cancellationCount(int $patientId): int
    {
        return Appointment::where('patient_id', $patientId)->where('status', 'cancelled')->count();
    }

    /**
     * Read-only — safe to call on every page load (dashboard banner,
     * booking-page gate). Never mutates anything; only evaluateAfterCancellation()
     * below does that, and only right after a cancel actually happens.
     */
    public function statusFor(Patient $patient): array
    {
        $count = $this->cancellationCount($patient->id);

        return [
            'cancellation_count' => $count,
            'warning' => $count >= self::WARNING_THRESHOLD && ! $patient->isBookingRestricted(),
            'restricted' => $patient->isBookingRestricted(),
            'restriction_threshold' => self::RESTRICTION_THRESHOLD,
        ];
    }

    /**
     * Call once, right after a patient-initiated cancel commits. Escalates
     * at most one step per call: a patient who was already restricted going
     * into this cancel jumps straight to deactivation (they cancelled again
     * after fair warning); otherwise, reaching the restriction threshold for
     * the first time sets the restriction. Never both in one call.
     */
    public function evaluateAfterCancellation(Patient $patient): void
    {
        if ($patient->isBookingRestricted()) {
            $patient->user->update(['status' => 'inactive']);

            Notification::notifyUser(
                $patient->user_id,
                'Account deactivated',
                'Your account has been deactivated after cancelling another appointment while booking-restricted. Please contact the clinic to resolve this.',
            );

            return;
        }

        $count = $this->cancellationCount($patient->id);

        if ($count >= self::RESTRICTION_THRESHOLD) {
            $patient->update([
                'booking_restricted_at' => now(),
                'restriction_count' => $patient->restriction_count + 1,
            ]);

            Notification::notifyUser(
                $patient->user_id,
                'New bookings restricted',
                "You've had {$count} cancelled appointments. New bookings are restricted until our staff clears this — please contact the clinic.",
                '/patient/dashboard',
            );
        }
    }
}
