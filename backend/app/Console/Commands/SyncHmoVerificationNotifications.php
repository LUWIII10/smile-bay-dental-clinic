<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\Notification;
use Illuminate\Console\Command;

/**
 * Catch-up for the exact gap this command exists to close: an appointment
 * can land in the staff HMO verification queue (StaffVerificationController
 * ::index() — same query as below) without ever having gone through a code
 * path that calls Notification::notifyRolesOnce() for it — either because
 * it was created before that call existed, or through some future path
 * that forgets to. Every real "needs verification" appointment right now
 * should have a notification; this makes that true and stays safe to
 * re-run (notifyRolesOnce() no-ops for an appointment that already has one).
 */
class SyncHmoVerificationNotifications extends Command
{
    protected $signature = 'notifications:sync-hmo-queue';

    protected $description = 'Create a staff "HMO verification needed" notification for any queue-eligible appointment missing one';

    public function handle(): int
    {
        $appointments = Appointment::where('patient_type_snapshot', 'hmo')
            ->where('status', 'pending_verification')
            ->where(function ($query) {
                $query->whereHas('service', fn ($q) => $q->where('name', 'not like', '%Pediatric%'))
                    ->orWhereNotNull('pediatric_confirmed_at');
            })
            ->whereDoesntHave('notifications')
            ->with('patient:id,first_name,last_name')
            ->get();

        if ($appointments->isEmpty()) {
            $this->info('Every pending HMO verification already has a notification.');

            return self::SUCCESS;
        }

        foreach ($appointments as $appointment) {
            Notification::notifyRolesOnce(
                ['dental_assistant', 'admin'],
                $appointment->id,
                'HMO verification needed',
                "New HMO booking from {$appointment->patient->first_name} {$appointment->patient->last_name} needs verification."
            );
        }

        $this->info("Created notifications for {$appointments->count()} appointment(s).");

        return self::SUCCESS;
    }
}
