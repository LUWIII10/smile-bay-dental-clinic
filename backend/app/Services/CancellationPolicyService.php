<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\Notification;
use App\Models\Patient;

/**
 * The "3-strike" reliability policy: cash patients auto-confirm with no
 * down payment, so nothing else in the system discourages booking
 * repeatedly and then either cancelling or simply not showing up. Counts
 * two kinds of strikes, added together:
 * - Patient-initiated cancellations only — status alone (cancelled vs
 *   rejected) turns out NOT to be enough to tell those apart:
 *   StaffAppointmentController::cancel() and AppointmentController::cancel()
 *   (dentist) ALSO write status='cancelled' when the CLINIC cancels on a
 *   patient's behalf (e.g. a scheduling conflict) — same status, but not
 *   the patient's doing, and neither of those two controllers calls
 *   evaluateAfterCancellation() (nor should they). cancellationCount()
 *   below cross-checks each cancelled row's appointment_status_log entry
 *   and only counts ones where changed_by is the patient's own user_id.
 * - Every no_show, with no such scoping needed — unlike 'cancelled',
 *   nothing else in the app ever writes status='no_show' except the
 *   patient's own absence (StaffAppointmentController::noShow(), manual, or
 *   the automatic MarkNoShowAppointments command), so every row counts.
 *
 * This isn't just a fairness fix — it's the actual fix for a real bug: a
 * patient reached 4 total cancelled appointments (mixed patient- and
 * clinic-initiated) without ever being restricted. With the old unscoped
 * count, evaluateAfterCancellation() — which only ever runs on the
 * patient's OWN cancel action — could read a total inflated by clinic-side
 * cancels the patient never triggered a check for, so whether/when
 * restriction fired depended on unpredictable timing rather than the
 * patient's own 3rd self-cancellation. Scoping the count to changed_by
 * fixes both problems at once: it's now exactly the patient's own count,
 * checked exactly when their own count changes.
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
 *
 * cancellation_count_reset_at is the opposite direction: lifting a
 * restriction (or reactivating a deactivated account) gives the patient a
 * genuine clean slate on the STRIKE COUNT itself — cancellationCount() only
 * counts cancellations whose own status-log entry is AFTER this timestamp
 * (null = no reset has ever happened, count everything, the original
 * all-time behavior). Without this, lifting a restriction would remove the
 * block but leave the count sitting at 3, immediately re-triggering on the
 * very next cancellation regardless of behavior since.
 */
class CancellationPolicyService
{
    private const WARNING_THRESHOLD = 1;

    private const RESTRICTION_THRESHOLD = 3;

    public function cancellationCount(Patient $patient): int
    {
        return Appointment::where('patient_id', $patient->id)
            ->where(function ($outer) use ($patient) {
                $outer->where(function ($w) use ($patient) {
                    $w->where('status', 'cancelled')
                        ->whereHas('statusLogs', function ($q) use ($patient) {
                            $q->where('new_status', 'cancelled')->where('changed_by', $patient->user_id);
                            if ($patient->cancellation_count_reset_at) {
                                // Strictly after, not >= — a reset and the
                                // cancellation that triggered it can land in
                                // the same second (timestamp columns are
                                // whole-second here), and >= would then fail
                                // to exclude the very cancellations the
                                // reset was supposed to clear.
                                $q->where('created_at', '>', $patient->cancellation_count_reset_at);
                            }
                        });
                })->orWhere(function ($w) use ($patient) {
                    $w->where('status', 'no_show');
                    if ($patient->cancellation_count_reset_at) {
                        // No per-row status-log scoping needed here (see
                        // class doc) — just the same reset cutoff, read off
                        // the appointment's own updated_at since no_show is
                        // a terminal status with nothing to log against.
                        $w->where('updated_at', '>', $patient->cancellation_count_reset_at);
                    }
                });
            })
            ->count();
    }

    /**
     * Read-only — safe to call on every page load (dashboard banner,
     * booking-page gate). Never mutates anything; only evaluateAfterCancellation()
     * below does that, and only right after a cancel actually happens.
     */
    public function statusFor(Patient $patient): array
    {
        $count = $this->cancellationCount($patient);

        return [
            'cancellation_count' => $count,
            'warning' => $count >= self::WARNING_THRESHOLD && ! $patient->isBookingRestricted(),
            'restricted' => $patient->isBookingRestricted(),
            'restriction_threshold' => self::RESTRICTION_THRESHOLD,
        ];
    }

    /**
     * Call once, right after a patient-initiated cancel commits. See
     * escalate() for the shared logic — a cancellation and a no-show
     * (evaluateAfterNoShow() below) escalate identically, only the wording
     * of the notice differs.
     */
    public function evaluateAfterCancellation(Patient $patient): void
    {
        $this->escalate($patient, 'cancelling another appointment', 'cancelled');
    }

    /**
     * Call once after an appointment is marked no_show — whether staff did
     * it manually (StaffAppointmentController::noShow()) or the automatic
     * nightly sweep did (MarkNoShowAppointments). Same escalation ladder as
     * a cancellation, since both strikes feed the same count.
     */
    public function evaluateAfterNoShow(Patient $patient): void
    {
        $this->escalate($patient, 'missing another appointment', 'cancelled or missed');
    }

    /**
     * Escalates at most one step per call: a patient who was already
     * restricted going into this strike jumps straight to deactivation
     * (fair warning already given); otherwise, reaching the restriction
     * threshold for the first time sets the restriction. Never both in one
     * call. $repeatOffensePhrase describes THIS strike (deactivation
     * notice); $tallyPhrase describes the running total (restriction
     * notice) — kept separate since "cancelling another appointment" reads
     * naturally but "cancelling another cancelled or missed appointment"
     * wouldn't.
     */
    private function escalate(Patient $patient, string $repeatOffensePhrase, string $tallyPhrase): void
    {
        if ($patient->isBookingRestricted()) {
            $patient->user->update(['status' => 'inactive']);

            Notification::notifyUser(
                $patient->user_id,
                'Account deactivated',
                "Your account has been deactivated after {$repeatOffensePhrase} while booking-restricted. Please contact the clinic to resolve this.",
            );
            // No human actor — this is the system's own automatic
            // escalation, not an admin clicking Deactivate (see
            // UserManagementController::updateStatus() for that one).
            ActivityLog::record(
                null,
                'account_deactivated',
                "{$patient->user->name}'s account was automatically deactivated after {$repeatOffensePhrase} while booking-restricted."
            );

            return;
        }

        $count = $this->cancellationCount($patient);

        if ($count >= self::RESTRICTION_THRESHOLD) {
            $patient->update([
                'booking_restricted_at' => now(),
                'restriction_count' => $patient->restriction_count + 1,
            ]);

            Notification::notifyUser(
                $patient->user_id,
                'New bookings restricted',
                "You've had {$count} {$tallyPhrase} appointments. New bookings are restricted until our staff clears this — please contact the clinic.",
                '/patient/dashboard',
            );
            // No human actor — the automatic 3-strike policy, not an admin
            // action (see UserManagementController::unrestrictBooking() for
            // the human-initiated Lift Restriction counterpart).
            ActivityLog::record(
                null,
                'account_restricted',
                "{$patient->user->name}'s new bookings were automatically restricted after {$count} {$tallyPhrase} appointments."
            );
        }
    }
}
