<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// services (2026_08_06_000004) was created empty — this seeds the fixed
// procedure catalog the appointment-scheduling module needs, including the
// duration each slot is dynamically blocked out for. insertOrIgnore against
// the table's unique `name` column, same pattern as
// 2026_08_10_000200_seed_default_hmo_providers.
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $services = [
            ['name' => 'Comprehensive Dental Consultation / Checkup', 'duration_minutes' => 30],
            ['name' => 'Routine Dental Cleaning (Oral Prophylaxis)', 'duration_minutes' => 45],
            ['name' => 'Tooth Filling (Composite - Simple)', 'duration_minutes' => 45],
            ['name' => 'Complex Tooth Filling (Multi-surface)', 'duration_minutes' => 60],
            ['name' => 'Simple Tooth Extraction', 'duration_minutes' => 45],
            ['name' => 'Surgical Extraction (Impacted Wisdom Tooth)', 'duration_minutes' => 90],
            ['name' => 'Root Canal Therapy (Initial / Single Canal)', 'duration_minutes' => 60],
            ['name' => 'Orthodontic Consultation / Adjustment', 'duration_minutes' => 30],
            ['name' => 'Teeth Whitening (In-Clinic)', 'duration_minutes' => 60],
        ];

        DB::table('services')->insertOrIgnore(array_map(
            fn (array $service) => [
                'name' => $service['name'],
                'description' => null,
                'duration_minutes' => $service['duration_minutes'],
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            $services
        ));
    }

    public function down(): void
    {
        DB::table('services')->whereIn('name', [
            'Comprehensive Dental Consultation / Checkup',
            'Routine Dental Cleaning (Oral Prophylaxis)',
            'Tooth Filling (Composite - Simple)',
            'Complex Tooth Filling (Multi-surface)',
            'Simple Tooth Extraction',
            'Surgical Extraction (Impacted Wisdom Tooth)',
            'Root Canal Therapy (Initial / Single Canal)',
            'Orthodontic Consultation / Adjustment',
            'Teeth Whitening (In-Clinic)',
        ])->delete();
    }
};
