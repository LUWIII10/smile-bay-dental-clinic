<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use App\Services\CancellationPolicyService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Nightly safety net for StaffAppointmentController::noShow() — that action
 * is staff-triggered and only allows marking a date that's already fully
 * passed, so a lapsed appointment nobody remembers to click sits as
 * "Confirmed"/"Pending" forever. This performs the exact same status flip
 * automatically, actor_id null (renders as "System / Automatic" in the
 * Activity Log — see ActivityLog::record()'s own nullable $actorId), for
 * every appointment whose date has fully passed with no resolution. Today
 * (date == appointment date) is deliberately left alone — that's the
 * "Running Late" window (AllAppointments.jsx's isRunningLate()), where staff
 * still has a same-day chance to move or reassign the slot.
 *
 * GRACE_DAYS is the buffer past that before assuming "nobody resolved it" —
 * a same-day-only cutoff gave staff literally zero room to finish charting
 * a busy day's visits before midnight auto-marked them missed. 2 days
 * covers normal same/next-day charting lag without leaving a genuine
 * no-show undetected for long.
 */
class MarkNoShowAppointments extends Command
{
    private const GRACE_DAYS = 2;

    protected $signature = 'appointments:mark-no-shows';

    protected $description = 'Automatically mark lapsed confirmed/pending appointments as no-show';

    public function handle(CancellationPolicyService $cancellationPolicy): int
    {
        $appointments = Appointment::whereIn('status', ['confirmed', 'pending_verification'])
            ->where('appointment_date', '<=', now()->subDays(self::GRACE_DAYS)->toDateString())
            ->with(['patient.user', 'service:id,name'])
            ->get();

        foreach ($appointments as $appointment) {
            DB::transaction(function () use ($appointment) {
                $oldStatus = $appointment->status;

                $appointment->update(['status' => 'no_show']);

                AppointmentStatusLog::create([
                    'appointment_id' => $appointment->id,
                    'old_status' => $oldStatus,
                    'new_status' => 'no_show',
                    'changed_by' => null,
                    'note' => 'Automatically marked as no-show — appointment date passed with no staff action.',
                ]);
            });

            Notification::notifyUser(
                $appointment->patient->user_id,
                'Missed appointment recorded',
                'Your '.$appointment->service->name.' appointment on '.$appointment->appointment_date->format('M j').' was marked as a missed visit. Contact the clinic if this is a mistake.',
                '/patient/appointments'
            );

            ActivityLog::record(
                null,
                'appointment_no_show',
                "System automatically marked {$appointment->patient->first_name} {$appointment->patient->last_name}'s "
                    ."{$appointment->service->name} appointment ({$appointment->appointment_date->format('M j')}) as a no-show."
            );

            $cancellationPolicy->evaluateAfterNoShow($appointment->patient);
        }

        $this->info("Marked {$appointments->count()} appointment(s) as no-show.");

        return self::SUCCESS;
    }
}
