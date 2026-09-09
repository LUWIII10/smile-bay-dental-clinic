<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// clinic_schedules (2026_08_06_000006) was created empty — seeds the clinic's
// operating hours: Monday-Saturday 09:00-18:00, Sunday closed. The 16:30
// last-booking-start cutoff is a booking-time rule (shorter than the 18:00
// close time, to leave room for the longest procedure), not stored here —
// it's applied when generating available slots, not as a schedule column.
// insertOrIgnore against the table's unique `day_of_week` column, same
// pattern as 2026_08_10_000200_seed_default_hmo_providers.
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $days = [
            ['day_of_week' => 0, 'open_time' => null, 'close_time' => null, 'is_open' => false], // Sunday
            ['day_of_week' => 1, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 2, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 3, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 4, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 5, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 6, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true], // Saturday
        ];

        DB::table('clinic_schedules')->insertOrIgnore(array_map(
            fn (array $day) => [...$day, 'created_at' => $now, 'updated_at' => $now],
            $days
        ));
    }

    public function down(): void
    {
        DB::table('clinic_schedules')->whereIn('day_of_week', [0, 1, 2, 3, 4, 5, 6])->delete();
    }
};
