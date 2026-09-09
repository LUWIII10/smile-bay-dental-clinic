<?php

namespace App\Console\Commands;

use App\Models\Appointment;
use App\Models\Notification;
use Illuminate\Console\Command;

/**
 * Day-before reminder for every confirmed appointment — the only
 * notifications built so far (AppointmentController, StaffVerification-
 * Controller, etc.) all fire at the moment something changes; nothing yet
 * told a patient "you have a visit coming up" on its own, with no action
 * having just happened. Meant to run once daily (see routes/console.php);
 * safe to re-run any number of times in the same day since each
 * appointment is checked against its own notifications.appointment_id
 * before a reminder is created for it.
 */
class SendUpcomingAppointmentReminders extends Command
{
    protected $signature = 'appointments:send-reminders';

    protected $description = 'Create an in-app reminder for every confirmed appointment happening tomorrow';

    public function handle(): int
    {
        $tomorrow = now()->addDay()->toDateString();

        $appointments = Appointment::where('status', 'confirmed')
            ->whereDate('appointment_date', $tomorrow)
            ->whereDoesntHave('notifications')
            ->with(['patient:id,user_id,first_name,last_name', 'service:id,name', 'dentist:id,name'])
            ->get();

        if ($appointments->isEmpty()) {
            $this->info('No confirmed appointments tomorrow without a reminder already sent.');

            return self::SUCCESS;
        }

        foreach ($appointments as $appointment) {
            $time = \Carbon\Carbon::parse($appointment->appointment_time)->format('g:i A');
            $dentistPart = $appointment->dentist ? " with {$appointment->dentist->name}" : '';

            Notification::notifyUser(
                userId: $appointment->patient->user_id,
                title: 'Upcoming appointment reminder',
                body: "You have a {$appointment->service->name} appointment tomorrow at {$time}{$dentistPart}.",
                url: '/patient/appointments',
                appointmentId: $appointment->id,
            );
        }

        $this->info("Sent {$appointments->count()} reminder(s).");

        return self::SUCCESS;
    }
}
