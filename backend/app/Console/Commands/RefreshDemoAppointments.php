<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Re-dates a fixed set of demo appointments relative to "today" so the
 * defense demo/rehearsal always has fresh, believable data — Dr. Castro
 * has something to mark Complete today, Ramirez/Santos aren't empty, the
 * HMO and pediatric queues have something pending, and Bea Alcantara's
 * past/upcoming tabs stay populated.
 *
 * Identification is BY HARD-CODED APPOINTMENT ID ONLY — the seven ids in
 * DEMO_APPOINTMENTS below, nothing pattern- or name-matched — so a row is
 * only ever touched if its primary key is literally one of these seven.
 * See DEMO_CHECKLIST.md §1/§7 for what each id is and why.
 *
 * Safe to re-run any number of times: every run performs the same UPDATEs
 * on the same seven rows (no Appointment::create() anywhere in here), so
 * it can never create a duplicate. It also undoes rehearsal side effects —
 * a "Complete" click on appt #140, an approve/reject on the queue items —
 * by force-resetting status and the verification/cancellation fields on
 * every run.
 *
 * If one of the seven ids has been deleted, it is reported and skipped,
 * not silently recreated — recreating it would hand out a new id and
 * quietly drift this list out of sync with itself run over run.
 */
class RefreshDemoAppointments extends Command
{
    protected $signature = 'demo:refresh';

    protected $description = 'Re-date the fixed set of demo appointments relative to today, for rehearsing the defense demo';

    /**
     * appointment id => spec. `days` is an offset from today (negative =
     * past). `status` is force-applied every run. `pediatric_confirmed`
     * marks the one row that must already be past the pediatric-dentist
     * gate; every other pending row has that gate explicitly cleared.
     */
    private const DEMO_APPOINTMENTS = [
        140 => ['label' => 'Dr. Castro — today, mark Complete on stage', 'days' => 0, 'time' => '10:00', 'status' => 'confirmed'],
        138 => ['label' => 'Dr. Ramirez — upcoming (schedule not empty)', 'days' => 2, 'time' => '10:00', 'status' => 'confirmed'],
        139 => ['label' => 'Dr. Santos — upcoming (schedule not empty)', 'days' => 3, 'time' => '10:00', 'status' => 'confirmed', 'pediatric_confirmed' => true],
        143 => ['label' => 'Pediatric Queue — pending review', 'days' => 2, 'time' => '09:00', 'status' => 'pending_verification'],
        137 => ['label' => 'Staff HMO Verification Queue — pending', 'days' => 4, 'time' => '11:00', 'status' => 'pending_verification'],
        141 => ['label' => 'Bea Alcantara — past completed visit', 'days' => -7, 'time' => '11:00', 'status' => 'completed'],
        142 => ['label' => 'Bea Alcantara — upcoming confirmed', 'days' => 3, 'time' => '11:00', 'status' => 'confirmed'],
    ];

    public function handle(): int
    {
        $this->info('Refreshing demo appointments relative to '.now()->toDateString().'…');
        $this->newLine();

        $rows = [];
        $missingIds = [];

        foreach (self::DEMO_APPOINTMENTS as $id => $spec) {
            $appointment = Appointment::find($id);

            if (! $appointment) {
                $missingIds[] = $id;

                continue;
            }

            $before = "{$appointment->appointment_date->toDateString()} {$appointment->appointment_time} [{$appointment->status}]";
            $oldStatus = $appointment->status;
            $newDate = now()->addDays($spec['days'])->toDateString();

            DB::transaction(function () use ($appointment, $spec, $newDate, $oldStatus) {
                $updates = [
                    'appointment_date' => $newDate,
                    'appointment_time' => $spec['time'],
                    'status' => $spec['status'],
                    // Always cleared: a rehearsal approve/reject/cancel can
                    // leave any of these set, and a stale value here would
                    // misrepresent the row's fresh, un-actioned state.
                    'verified_by' => null,
                    'verified_at' => null,
                    'cancellation_reason' => null,
                    'hmo_status_label' => null,
                    'hmo_status_note' => null,
                    'hmo_status_updated_at' => null,
                ];

                if (! empty($spec['pediatric_confirmed'])) {
                    $updates['pediatric_confirmed_at'] = now();
                    $updates['pediatric_confirmed_by'] = $appointment->dentist_id;
                } else {
                    $updates['pediatric_confirmed_at'] = null;
                    $updates['pediatric_confirmed_by'] = null;
                }

                $appointment->update($updates);

                AppointmentStatusLog::create([
                    'appointment_id' => $appointment->id,
                    'old_status' => $oldStatus,
                    'new_status' => $spec['status'],
                    'changed_by' => $appointment->patient->user_id,
                    'note' => 'Re-dated by `php artisan demo:refresh`.',
                ]);
            });

            $rows[] = [$id, $spec['label'], $before, "{$newDate} {$spec['time']} [{$spec['status']}]"];
        }

        if ($rows) {
            $this->table(['id', 'demo role', 'before', 'after'], $rows);
        }

        if ($missingIds) {
            $this->newLine();
            $this->warn('These managed ids no longer exist and were NOT recreated: '.implode(', ', $missingIds));
            $this->warn('They were not touched — nothing was created in their place. Ask for them to be rebuilt if you still need that slot.');
        }

        $this->newLine();
        $this->info(count($rows).' demo appointment(s) refreshed'.($missingIds ? ', '.count($missingIds).' missing.' : '.'));

        return self::SUCCESS;
    }
}
