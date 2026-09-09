<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\DentistDayOff;
use App\Models\DentistWeeklyHour;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * CRUD + conflict-safety for the "My Availability" feature — separate from
 * AppointmentSlotService (which stays read-only scheduling math consumed by
 * the booking flow) since this is a different concern: mutating a dentist's
 * own hours/day-offs, with a check that an in-flight change never silently
 * strands an already-booked appointment outside the new hours.
 */
class DentistAvailabilityService
{
    // Only these statuses represent a real, standing commitment worth
    // warning about — matches AppointmentSlotService::OCCUPYING_STATUSES
    // exactly (cancelled/rejected/completed/no_show appointments don't hold
    // a slot, so a hours change can never "conflict" with one of those).
    private const CONFLICT_STATUSES = ['pending_verification', 'confirmed'];

    private const EDITABLE_DAYS = [1, 2, 3, 4, 5, 6]; // Monday-Saturday; Sunday is clinic-wide closed, not editable here.

    public function forDentist(int $dentistId): array
    {
        $rows = DentistWeeklyHour::where('dentist_id', $dentistId)
            ->whereIn('day_of_week', self::EDITABLE_DAYS)
            ->get()
            ->keyBy('day_of_week');

        $weeklyHours = collect(self::EDITABLE_DAYS)->map(function (int $day) use ($rows) {
            $row = $rows->get($day);

            return [
                'day_of_week' => $day,
                'is_active' => $row?->is_active ?? false,
                'start_time' => $row?->start_time ? Carbon::parse($row->start_time)->format('H:i') : null,
                'end_time' => $row?->end_time ? Carbon::parse($row->end_time)->format('H:i') : null,
            ];
        })->values()->all();

        $dayOffs = DentistDayOff::where('dentist_id', $dentistId)
            ->where('date', '>=', now()->toDateString())
            ->orderBy('date')
            ->get(['id', 'date', 'reason'])
            ->map(fn (DentistDayOff $d) => [
                'id' => $d->id,
                'date' => $d->date->toDateString(),
                'reason' => $d->reason,
            ])
            ->values()
            ->all();

        return ['weekly_hours' => $weeklyHours, 'day_offs' => $dayOffs];
    }

    /**
     * Appointments (confirmed/pending) currently on this dentist's books
     * that the given proposed weekly-hours change would push outside the
     * new hours — day turned inactive, or the appointment starts before the
     * new start_time or its end (start + service duration) runs past the
     * new end_time. Only ever looks at today-forward, matching "the change
     * only affects future slot availability going forward".
     */
    public function conflictsForWeeklyHours(int $dentistId, array $hours): Collection
    {
        $byDay = collect($hours)->keyBy('day_of_week');

        return Appointment::where('dentist_id', $dentistId)
            ->where('appointment_date', '>=', now()->toDateString())
            ->whereIn('status', self::CONFLICT_STATUSES)
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name,duration_minutes'])
            ->get()
            ->filter(function (Appointment $appointment) use ($byDay) {
                $dayOfWeek = Carbon::parse($appointment->appointment_date)->dayOfWeek;
                $rule = $byDay->get($dayOfWeek);

                // Sunday (or any day not part of the payload) can't be
                // touched by this change — never a conflict.
                if (! $rule) {
                    return false;
                }

                if (! $rule['is_active']) {
                    return true;
                }

                $apptStart = Carbon::parse($appointment->appointment_date->toDateString().' '.$appointment->appointment_time);
                $apptEnd = $apptStart->copy()->addMinutes($appointment->service->duration_minutes);
                $newStart = Carbon::parse($appointment->appointment_date->toDateString().' '.$rule['start_time']);
                $newEnd = Carbon::parse($appointment->appointment_date->toDateString().' '.$rule['end_time']);

                return $apptStart->lt($newStart) || $apptEnd->gt($newEnd);
            })
            ->values();
    }

    /**
     * Appointments (confirmed/pending) already booked on the exact date a
     * new day-off would cover.
     */
    public function conflictsForDayOff(int $dentistId, string $date): Collection
    {
        return Appointment::where('dentist_id', $dentistId)
            ->where('appointment_date', $date)
            ->whereIn('status', self::CONFLICT_STATUSES)
            ->with(['patient:id,patient_number,first_name,last_name', 'service:id,name'])
            ->get()
            ->values();
    }

    /**
     * Formats a conflicting-appointments collection for the API response —
     * just enough for the frontend's warning modal (date, time, patient
     * name), not the full appointment payload.
     */
    public function formatConflicts(Collection $appointments): array
    {
        return $appointments->map(fn (Appointment $a) => [
            'id' => $a->id,
            'date' => $a->appointment_date->toDateString(),
            'time' => Carbon::parse($a->appointment_time)->format('H:i'),
            'patient_name' => trim(($a->patient->first_name ?? '').' '.($a->patient->last_name ?? '')) ?: 'Unknown patient',
            'service_name' => $a->service->name ?? null,
        ])->all();
    }

    /**
     * Upserts Monday-Saturday's rows in one transaction. Sunday is never
     * touched — it has no row in $hours to begin with (EDITABLE_DAYS), and
     * stays whatever it was seeded as (clinic-wide closed).
     */
    public function saveWeeklyHours(int $dentistId, array $hours): void
    {
        DB::transaction(function () use ($dentistId, $hours) {
            foreach ($hours as $row) {
                $isActive = (bool) $row['is_active'];

                DentistWeeklyHour::updateOrCreate(
                    ['dentist_id' => $dentistId, 'day_of_week' => $row['day_of_week']],
                    [
                        'is_active' => $isActive,
                        // Defensive, matches isSlotAvailable()'s "never trust
                        // the client" precedent — an inactive day never
                        // stores stale hours regardless of what was posted.
                        'start_time' => $isActive ? $row['start_time'] : null,
                        'end_time' => $isActive ? $row['end_time'] : null,
                    ]
                );
            }
        });
    }

    public function addDayOff(int $dentistId, string $date, ?string $reason): DentistDayOff
    {
        return DentistDayOff::create([
            'dentist_id' => $dentistId,
            'date' => $date,
            'reason' => $reason,
        ]);
    }
}
