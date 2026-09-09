<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Seeds every existing dentist-role user (currently: Dr. Ramirez, Dr. Castro,
// the Pediatric Dentistry account) with the exact same Monday-Saturday
// 09:00-18:00 / Sunday-closed pattern clinic_schedules already defines —
// nothing changes for any of them until they explicitly customize their own
// hours via the new My Availability page. Looping over role=dentist (rather
// than hardcoding the three names) means any dentist added later through
// the normal account-creation flow still needs its own explicit day-1
// customization rather than silently inheriting a stale seed, but these
// three get seeded now since they already exist.
// insertOrIgnore against the table's unique (dentist_id, day_of_week), same
// pattern as 2026_08_13_000200_seed_clinic_schedules.
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $days = [
            ['day_of_week' => 0, 'start_time' => null, 'end_time' => null, 'is_active' => false], // Sunday
            ['day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true],
            ['day_of_week' => 2, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true],
            ['day_of_week' => 3, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true],
            ['day_of_week' => 4, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true],
            ['day_of_week' => 5, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true],
            ['day_of_week' => 6, 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'is_active' => true], // Saturday
        ];

        $dentistIds = DB::table('users')->where('role', 'dentist')->pluck('id');

        $rows = [];
        foreach ($dentistIds as $dentistId) {
            foreach ($days as $day) {
                $rows[] = [...$day, 'dentist_id' => $dentistId, 'created_at' => $now, 'updated_at' => $now];
            }
        }

        if ($rows) {
            DB::table('dentist_weekly_hours')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        DB::table('dentist_weekly_hours')->truncate();
    }
};
