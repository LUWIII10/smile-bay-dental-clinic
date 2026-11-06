<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Services\DatabaseBackupService;
use Illuminate\Console\Command;

/**
 * Scheduled daily (routes/console.php) — deliberately checks "is a backup
 * actually due" itself rather than being scheduled ->weekly()/->monthly(),
 * so turning Weekly on today backs up today instead of waiting for the next
 * fixed day, and changing the frequency mid-cycle doesn't leave a stale
 * schedule behind.
 */
class RunScheduledBackup extends Command
{
    protected $signature = 'backups:run-scheduled';

    protected $description = 'Generates a database backup if the admin-configured weekly/monthly schedule is due.';

    public function handle(DatabaseBackupService $backups): int
    {
        $settings = $backups->settings();

        if ($settings->frequency === 'off') {
            $this->info('Backups are off — nothing to do.');

            return self::SUCCESS;
        }

        $last = DatabaseBackup::where('frequency_tag', $settings->frequency)
            ->where('status', 'completed')
            ->latest('completed_at')
            ->first();

        $intervalDays = $settings->frequency === 'weekly' ? 7 : 30;

        if ($last && $last->completed_at->diffInDays(now()) < $intervalDays) {
            $this->info("Not due yet — last {$settings->frequency} backup was {$last->completed_at->diffForHumans()}.");

            return self::SUCCESS;
        }

        try {
            $backup = $backups->generate($settings->frequency);
            $this->info("Backup created: {$backup->filename}");
        } catch (\Throwable $e) {
            $this->error("Backup failed: {$e->getMessage()}");

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
