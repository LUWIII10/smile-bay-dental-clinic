<?php

namespace App\Console\Commands;

use App\Models\{Appointment, DentalRecord, Patient, User};
use Carbon\Carbon;
use Database\Seeders\DemoPatientSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class SeedPresentationData extends Command
{
    protected $signature = 'demo:seed-presentation {--date= : Presentation date, YYYY-MM-DD; defaults to today in Manila} {--dry-run : Validate replacement and roll back}';
    protected $description = 'Replace known seeded test patients with a clean, realistic presentation cohort';

    public function handle(): int
    {
        $date = $this->option('date') ?: Carbon::today('Asia/Manila')->toDateString();
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || ! Carbon::hasFormatWithModifiers($date, 'Y-m-d')) {
            $this->error('Use a valid YYYY-MM-DD date.');
            return self::FAILURE;
        }

        DB::beginTransaction();
        try {
            $seed = app(DemoPatientSeeder::class);
            $seed->presentation = true;
            $seed->anchor = Carbon::createFromFormat('!Y-m-d', $date, 'Asia/Manila');
            if ($seed->anchor->toDateString() !== $date) {
                throw new RuntimeException('Use a real calendar date.');
            }

            $oldEmails = (new DemoPatientSeeder)->patientEmails();
            $emails = [...$oldEmails, ...$seed->patientEmails(), 'test@example.com'];
            $users = User::whereIn('email', $emails)->get();
            if ($users->contains(fn ($user) => $user->role !== 'patient')) {
                throw new RuntimeException('A seeded email belongs to a staff account; nothing was changed.');
            }
            $presentationEmails = $seed->patientEmails();
            if ($users->contains(fn ($user) => in_array($user->email, $presentationEmails, true)
                && ! preg_match('/^(0917|0928|0995)XXX\d{4}$/', $user->mobile_number ?? ''))) {
                throw new RuntimeException('A presentation email belongs to an unrelated account; nothing was changed.');
            }
            $patientIds = Patient::whereIn('user_id', $users->modelKeys())->pluck('id');
            // Delete dependents in FK order; do not disable integrity checks.
            DentalRecord::whereIn('patient_id', $patientIds)->delete();
            Appointment::whereIn('patient_id', $patientIds)->delete();
            Patient::whereIn('id', $patientIds)->delete();
            User::whereIn('id', $users->modelKeys())->delete();

            $seed->setCommand($this)->run();
            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->info('Dry run passed; database changes rolled back.');
            } else {
                DB::commit();
                $this->info('Presentation data ready. Existing staff and unrelated patients preserved.');
            }
            return self::SUCCESS;
        } catch (Throwable $error) {
            DB::rollBack();
            $this->error($error->getMessage());
            return self::FAILURE;
        }
    }
}
