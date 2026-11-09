<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Requires a real OS-level cron (or Windows Task Scheduler) calling
// `php artisan schedule:run` every minute — this line alone doesn't make
// anything fire on its own. Safe to re-run manually any time in the
// meantime (`php artisan appointments:send-reminders`); duplicate reminders
// for the same appointment are prevented in the command itself.
Schedule::command('appointments:send-reminders')->dailyAt('08:00');

// Same "requires a real cron" caveat as above — RunScheduledBackup itself
// decides whether a backup is actually due (Settings > Database Backups'
// own frequency), so running this daily is safe even though most days it
// does nothing.
Schedule::command('backups:run-scheduled')->dailyAt('02:00');

// Same "requires a real cron" caveat as above — safe to re-run manually
// (`php artisan appointments:mark-no-shows`); it only ever touches
// appointments whose date has already fully passed, so running it twice in
// a row finds nothing the second time. See MarkNoShowAppointments's own
// doc comment for why this is scoped to past dates only, not today's
// lapsed-but-still-"Running Late" appointments.
Schedule::command('appointments:mark-no-shows')->dailyAt('00:05');
