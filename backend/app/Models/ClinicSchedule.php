<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One row per day_of_week (0=Sunday..6=Saturday), seeded once by
// 2026_08_13_000200_seed_clinic_schedules — always exactly 7 rows, never
// created/deleted through the app itself, only updated.
class ClinicSchedule extends Model
{
    protected $fillable = [
        'day_of_week',
        'open_time',
        'close_time',
        'is_open',
    ];

    protected function casts(): array
    {
        return [
            'is_open' => 'boolean',
        ];
    }
}
