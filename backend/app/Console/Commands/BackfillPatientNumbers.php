<?php

namespace App\Console\Commands;

use App\Models\Patient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-time backfill for the patient_number column added alongside this
 * command — every patient who registered before the "PT-YYYY-NNNN" system
 * existed has patient_number = null until this runs. Ordered by created_at
 * (oldest first) so the sequence reads chronologically, same as if they'd
 * been numbered as they signed up; each patient's own id becomes their
 * sequence number (see Patient::formatPatientNumber()), so the assignment
 * is deterministic and safe to re-run — already-numbered rows are skipped,
 * never re-numbered.
 */
class BackfillPatientNumbers extends Command
{
    protected $signature = 'patients:backfill-numbers';

    protected $description = 'Assign a patient_number to every existing patient who doesn\'t have one yet';

    public function handle(): int
    {
        $patients = Patient::whereNull('patient_number')->orderBy('created_at')->get();

        if ($patients->isEmpty()) {
            $this->info('Every patient already has a patient_number — nothing to do.');
        } else {
            DB::transaction(function () use ($patients) {
                foreach ($patients as $patient) {
                    $patient->update(['patient_number' => Patient::formatPatientNumber($patient->id, $patient->created_at)]);
                }
            });

            $this->info("Assigned patient_number to {$patients->count()} patient(s).");
        }

        $this->newLine();
        $this->table(
            ['ID', 'Patient Number', 'Name', 'Registered'],
            Patient::orderBy('created_at')->get()->map(fn (Patient $p) => [
                $p->id,
                $p->patient_number,
                trim("{$p->first_name} {$p->last_name}"),
                $p->created_at->toDateString(),
            ])
        );

        return self::SUCCESS;
    }
}
