<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Idempotent, ID-pinned seed of the full 20-service thesis catalog.
 * updateOrInsert(['id' => X], [...]) is deliberate — matching by primary
 * key, not by name — so ids 1-9 are updated IN PLACE every time this runs,
 * never dropped and re-created. That matters because appointments.service_id
 * is a live foreign key: appointment #6/#29 reference service_id 4, and
 * #7/#30 reference service_id 1. Re-running this seeder is safe.
 *
 * Trade-off worth knowing: updateOrInsert applies the same $values to both
 * the insert and update path, so created_at gets touched to "now" on ids
 * 1-9 every time this re-runs, not just on first insert. Nothing in the app
 * reads services.created_at, so this is harmless — flagging it only because
 * it's a deviation from Eloquent's usual create-vs-update timestamp handling.
 */
class ServiceSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $services = [
            // ---- General Dentistry ----
            ['id' => 1, 'name' => 'Comprehensive Dental Consultation / Checkup', 'category' => 'General Dentistry', 'duration_minutes' => 30],
            ['id' => 2, 'name' => 'Cleaning (Oral Prophylaxis)', 'category' => 'General Dentistry', 'duration_minutes' => 30],
            ['id' => 3, 'name' => 'Tooth Filling (Composite - Simple)', 'category' => 'General Dentistry', 'duration_minutes' => 45],
            ['id' => 4, 'name' => 'Complex Tooth Filling (Multi-surface)', 'category' => 'General Dentistry', 'duration_minutes' => 60],
            ['id' => 5, 'name' => 'Simple Tooth Extraction', 'category' => 'General Dentistry', 'duration_minutes' => 45],
            ['id' => 6, 'name' => 'Surgical Extraction (Impacted Wisdom Tooth)', 'category' => 'General Dentistry', 'duration_minutes' => 90],
            ['id' => 7, 'name' => 'Root Canal Therapy (Initial / Single Canal)', 'category' => 'General Dentistry', 'duration_minutes' => 60],
            ['id' => 10, 'name' => 'Crowns (Fitting & Placement)', 'category' => 'General Dentistry', 'duration_minutes' => 60],
            ['id' => 11, 'name' => 'Dentures (Fitting / Adjustment)', 'category' => 'General Dentistry', 'duration_minutes' => 45],

            // ---- Cosmetic Dentistry ----
            ['id' => 9, 'name' => 'Teeth Whitening (In-Clinic)', 'category' => 'Cosmetic Dentistry', 'duration_minutes' => 60],
            ['id' => 12, 'name' => 'Veneers (Fitting & Consultation)', 'category' => 'Cosmetic Dentistry', 'duration_minutes' => 60],
            ['id' => 13, 'name' => 'Gum Recontouring', 'category' => 'Cosmetic Dentistry', 'duration_minutes' => 45],

            // ---- Orthodontics ----
            ['id' => 8, 'name' => 'Orthodontic Consultation / Adjustment', 'category' => 'Orthodontics', 'duration_minutes' => 30],
            ['id' => 14, 'name' => 'Braces (Installation / Adjustment)', 'category' => 'Orthodontics', 'duration_minutes' => 60],
            ['id' => 15, 'name' => 'Clear Aligners (Fitting & Progress Visit)', 'category' => 'Orthodontics', 'duration_minutes' => 45],
            ['id' => 16, 'name' => 'Retainers (Fitting / Check)', 'category' => 'Orthodontics', 'duration_minutes' => 30],

            // ---- Specialist Services ----
            ['id' => 17, 'name' => 'Pediatric Dentistry (General Consultation)', 'category' => 'Specialist Services', 'duration_minutes' => 30],
            ['id' => 18, 'name' => 'Dental Implants (Consultation / Surgery)', 'category' => 'Specialist Services', 'duration_minutes' => 90],
            ['id' => 19, 'name' => 'TMJ Disorders (Consultation & Triage)', 'category' => 'Specialist Services', 'duration_minutes' => 45],
            ['id' => 20, 'name' => 'Sedation Dentistry (Consultation Add-on)', 'category' => 'Specialist Services', 'duration_minutes' => 30],
        ];

        foreach ($services as $service) {
            DB::table('services')->updateOrInsert(
                ['id' => $service['id']],
                [
                    'name' => $service['name'],
                    'description' => null,
                    'category' => $service['category'],
                    'duration_minutes' => $service['duration_minutes'],
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }
    }
}
