<?php

namespace App\Services;

use App\Models\ClinicSpecialHour;

/**
 * CRUD for one-off Special Opening Dates — the inverse of
 * ClinicClosureService. No conflict-checking needed here: opening an extra
 * date can never strand an existing appointment the way a closure can, so
 * there's nothing to warn about before saving one.
 */
class ClinicSpecialHourService
{
    public function upcoming(): array
    {
        return ClinicSpecialHour::where('date', '>=', now()->toDateString())
            ->orderBy('date')
            ->get(['id', 'date', 'open_time', 'close_time', 'reason'])
            ->map(fn (ClinicSpecialHour $s) => [
                'id' => $s->id,
                'date' => $s->date->toDateString(),
                'open_time' => $s->open_time,
                'close_time' => $s->close_time,
                'reason' => $s->reason,
            ])
            ->values()
            ->all();
    }

    public function store(string $date, string $openTime, string $closeTime, ?string $reason): ClinicSpecialHour
    {
        return ClinicSpecialHour::create([
            'date' => $date,
            'open_time' => $openTime,
            'close_time' => $closeTime,
            'reason' => $reason,
        ]);
    }
}
