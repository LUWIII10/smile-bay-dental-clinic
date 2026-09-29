<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-time backfill: the Activity Log page shipped with an empty table —
 * everything from before that point only exists as plain rows scattered
 * across users/appointments/appointment_status_log/patients, with no
 * ActivityLog::record() call ever having run for them. This reconstructs
 * what CAN be honestly reconstructed from timestamps/columns that already
 * exist, and skips anything that can't be (see each section's own note).
 *
 * Guarded to run at most once via a dedicated marker row (action =
 * system_backfill_completed, filtered out of ActivityLogController::index()
 * so it never shows up as a real event) — NOT a blanket "does activity_logs
 * have any rows" check. This runs automatically on every deploy (see
 * docker/start.sh), and real usage can easily write a row (someone books an
 * appointment) before this line ever gets to run for the first time; a
 * blanket check would see that one real row and skip the backfill entirely,
 * forever, having done nothing.
 *
 * Also guards against duplicating that kind of already-logged real event:
 * only backfills rows dated strictly BEFORE the earliest real (non-marker)
 * row already on file, if any exists. Everything this command reconstructs
 * is inherently historical (from before this feature existed), so it can
 * never legitimately need to insert anything at or after that point —
 * whatever's already there from real usage is left alone.
 */
class BackfillActivityLog extends Command
{
    private const COMPLETED_MARKER = 'system_backfill_completed';

    protected $signature = 'activity-log:backfill';

    protected $description = 'One-time backfill of ActivityLog rows from existing historical data (accounts, appointments, status changes) so the Activity Log page reflects real history instead of starting empty.';

    public function handle(): int
    {
        if (ActivityLog::where('action', self::COMPLETED_MARKER)->exists()) {
            $this->warn('The backfill has already completed once — refusing to run again. Nothing was changed.');

            return self::SUCCESS;
        }

        // Anything already logged for real (live ActivityLog::record() calls
        // since this feature shipped) must never be duplicated below.
        $cutoff = ActivityLog::where('action', '!=', self::COMPLETED_MARKER)->min('created_at');
        if ($cutoff) {
            $this->info("Existing real activity found — only backfilling entries strictly before {$cutoff}.");
        }

        $rows = [];

        // 1. Account creation — every user row has created_at. Patients:
        // self-registration, actor is honestly themselves. Staff: nobody
        // recorded WHO created them at the time (no created_by column ever
        // existed), so actor is null rather than guessing.
        User::where('role', 'patient')->get(['id', 'name', 'created_at'])->each(function (User $user) use (&$rows) {
            $rows[] = [
                'actor_id' => $user->id,
                'action' => 'account_created',
                'description' => "{$user->name} registered a new patient account.",
                'created_at' => $user->created_at,
            ];
        });

        User::whereIn('role', ['dentist', 'dental_assistant', 'admin'])
            ->get(['id', 'name', 'role', 'created_at'])
            ->each(function (User $user) use (&$rows) {
                $roleLabel = str_replace('_', ' ', $user->role);
                $rows[] = [
                    'actor_id' => null,
                    'action' => 'staff_account_created',
                    'description' => "{$user->name}'s {$roleLabel} account was created.",
                    'created_at' => $user->created_at,
                ];
            });

        $this->info('Queued '.count($rows).' account-creation entries.');

        // 2. Every appointment ever booked — created_at is exactly when
        // AppointmentController::store() (or the walk-in equivalent) ran.
        Appointment::with(['patient.user:id,name', 'service:id,name'])
            ->get(['id', 'patient_id', 'service_id', 'appointment_date', 'created_at'])
            ->each(function (Appointment $appointment) use (&$rows) {
                $patientUser = $appointment->patient?->user;
                if (! $patientUser) {
                    return;
                }
                $serviceName = $appointment->service?->name ?? 'a service';
                $rows[] = [
                    'actor_id' => $patientUser->id,
                    'action' => 'appointment_booked',
                    'description' => "{$patientUser->name} booked a {$serviceName} appointment for {$appointment->appointment_date->toDateString()}.",
                    'created_at' => $appointment->created_at,
                ];
            });

        $this->info('Queued booking entries — running total: '.count($rows));

        // 3 & 4. Cancelled / rejected — appointment_status_log already has
        // exactly who (changed_by) and when (created_at) for every real
        // transition, patient- or staff-initiated alike.
        AppointmentStatusLog::whereIn('new_status', ['cancelled', 'rejected'])
            ->with(['appointment.patient.user:id,name', 'appointment.service:id,name', 'changedBy:id,name'])
            ->get()
            ->each(function (AppointmentStatusLog $log) use (&$rows) {
                if (! $log->appointment) {
                    return;
                }
                $patientName = $log->appointment->patient?->user?->name ?? 'a patient';
                $serviceName = $log->appointment->service?->name ?? 'an appointment';
                $actorName = $log->changedBy?->name ?? 'Someone';
                $isCancelled = $log->new_status === 'cancelled';
                $rows[] = [
                    'actor_id' => $log->changed_by,
                    'action' => $isCancelled ? 'appointment_cancelled' : 'appointment_rejected',
                    'description' => $isCancelled
                        ? "{$actorName} cancelled {$patientName}'s {$serviceName} visit."
                        : "{$actorName} rejected {$patientName}'s {$serviceName} booking.",
                    'created_at' => $log->created_at,
                ];
            });

        $this->info('Queued cancellation/rejection entries — running total: '.count($rows));

        // 5. HMO coverage verified — verified_at/verified_by are set
        // exactly once, by StaffVerificationController::verify()'s approve
        // branch or proposeNewDate(), and never cleared afterward, so this
        // is a reliable reconstruction (unlike the restriction/reschedule
        // fields below, which DO get cleared on their own follow-up action).
        Appointment::whereNotNull('verified_at')
            ->where('patient_type_snapshot', 'hmo')
            ->with(['patient.user:id,name', 'service:id,name', 'verifiedBy:id,name'])
            ->get(['id', 'patient_id', 'service_id', 'verified_at', 'verified_by'])
            ->each(function (Appointment $appointment) use (&$rows) {
                $patientName = $appointment->patient?->user?->name ?? 'a patient';
                $serviceName = $appointment->service?->name ?? 'a service';
                $actorName = $appointment->verifiedBy?->name ?? 'Staff';
                $rows[] = [
                    'actor_id' => $appointment->verified_by,
                    'action' => 'hmo_verified',
                    'description' => "{$actorName} approved {$patientName}'s HMO coverage for {$serviceName}.",
                    'created_at' => $appointment->verified_at,
                ];
            });

        $this->info('Queued HMO verification entries — running total: '.count($rows));

        // 6. Currently-restricted accounts — booking_restricted_at IS the
        // timestamp of the restriction event itself. A PAST restriction
        // that has since been lifted is NOT reconstructable: lifting clears
        // this column, with nothing left behind that says exactly when the
        // original restriction happened (restriction_count is a lifetime
        // tally, not a per-event log). Deliberately not guessed at.
        Patient::whereNotNull('booking_restricted_at')
            ->with('user:id,name')
            ->get(['id', 'user_id', 'booking_restricted_at'])
            ->each(function (Patient $patient) use (&$rows) {
                if (! $patient->user) {
                    return;
                }
                $rows[] = [
                    'actor_id' => null,
                    'action' => 'account_restricted',
                    'description' => "{$patient->user->name}'s new bookings were automatically restricted after repeated cancellations.",
                    'created_at' => $patient->booking_restricted_at,
                ];
            });

        // 7. A patient whose strike count was ever reset (cancellation_count_reset_at
        // set) had a Lift Restriction or Activate click at some point — same
        // "which admin, exactly" gap as staff_account_created above, so
        // actor is null. Currently-restricted accounts are skipped here
        // (already covered by #6, and a currently-active restriction means
        // this reset — if any — predates it, which would misleadingly
        // suggest it's already been resolved).
        Patient::whereNotNull('cancellation_count_reset_at')
            ->whereNull('booking_restricted_at')
            ->with('user:id,name')
            ->get(['id', 'user_id', 'cancellation_count_reset_at'])
            ->each(function (Patient $patient) use (&$rows) {
                if (! $patient->user) {
                    return;
                }
                $rows[] = [
                    'actor_id' => null,
                    'action' => 'restriction_lifted',
                    'description' => "{$patient->user->name}'s booking restriction was lifted.",
                    'created_at' => $patient->cancellation_count_reset_at,
                ];
            });

        $this->info('Queued restriction entries — running total: '.count($rows));

        // 8. Currently-deactivated accounts — no column records exactly
        // when a manual Deactivate (or the automatic while-restricted
        // escalation) happened, so this uses the row's own updated_at as a
        // best-effort timestamp (imprecise — updated_at moves on ANY field
        // change to the row, not status specifically — but it's the
        // closest real signal available, better than omitting these
        // accounts from the log entirely).
        User::where('status', 'inactive')
            ->get(['id', 'name', 'updated_at'])
            ->each(function (User $user) use (&$rows) {
                $rows[] = [
                    'actor_id' => null,
                    'action' => 'account_deactivated',
                    'description' => "{$user->name}'s account is currently deactivated.",
                    'created_at' => $user->updated_at,
                ];
            });

        $this->info('Queued deactivation entries — running total: '.count($rows));

        // Model::insert() is a raw query-builder bulk insert — it skips
        // Eloquent's own datetime casting, so every Carbon instance is
        // normalized to a plain MySQL datetime string here rather than
        // trusting PDO to stringify it correctly on its own. 'Y-m-d H:i:s'
        // sorts correctly as a plain string, so the cutoff filter right
        // after can compare these as strings too.
        $rows = array_map(function (array $row) {
            $row['created_at'] = $row['created_at']?->format('Y-m-d H:i:s') ?? now()->format('Y-m-d H:i:s');

            return $row;
        }, $rows);

        if ($cutoff) {
            $before = count($rows);
            $rows = array_values(array_filter($rows, fn (array $row) => $row['created_at'] < $cutoff));
            $skipped = $before - count($rows);
            if ($skipped > 0) {
                $this->info("Skipped {$skipped} entries at or after the cutoff (already covered by real activity).");
            }
        }

        DB::transaction(function () use ($rows) {
            foreach (array_chunk($rows, 500) as $chunk) {
                ActivityLog::insert($chunk);
            }

            // Written LAST, inside the same transaction, so a run that
            // fails partway through never leaves this marker behind without
            // the data it's supposed to vouch for.
            ActivityLog::create([
                'actor_id' => null,
                'action' => self::COMPLETED_MARKER,
                'description' => 'Historical activity backfill completed.',
            ]);
        });

        $this->info('Backfilled '.count($rows).' activity log entries.');

        return self::SUCCESS;
    }
}
