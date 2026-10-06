<?php

namespace App\Console\Commands;

use Carbon\Carbon;
use Database\Seeders\DemoPatientSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class SeedDemoPatients extends Command
{
    protected $signature = 'demo:seed-patients {--date= : Demo reference date, YYYY-MM-DD; defaults to today in Manila} {--dry-run : Validate all inserts then roll them back}';
    protected $description = 'Add exactly 50 fictional demo patients using existing clinic reference data';

    public function handle(): int
    {
        if ($this->option('date') && (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $this->option('date')) || ! Carbon::hasFormatWithModifiers($this->option('date'), 'Y-m-d'))) {
            $this->error('Use a valid YYYY-MM-DD reference date.');
            return self::FAILURE;
        }
        DB::beginTransaction();
        try {
            $seeder = app(DemoPatientSeeder::class);
            $seeder->anchor = $this->option('date') ? Carbon::createFromFormat('!Y-m-d', $this->option('date'), 'Asia/Manila') : Carbon::today('Asia/Manila');
            if ($this->option('date') && $seeder->anchor->toDateString() !== $this->option('date')) {
                throw new \RuntimeException('Use a real calendar date in YYYY-MM-DD format.');
            }
            $seeder->setCommand($this)->run();
            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->info('Dry run passed. All inserted rows were rolled back.');
            } else {
                DB::commit();
            }
            return self::SUCCESS;
        } catch (Throwable $e) {
            DB::rollBack();
            $this->error($e->getMessage());
            return self::FAILURE;
        }
    }
}
