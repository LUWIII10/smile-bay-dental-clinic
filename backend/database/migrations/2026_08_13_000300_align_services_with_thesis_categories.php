<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Aligns the services catalog with the thesis's Definition of Terms /
 * Project Context sections: adds a `category` column and brings the seeded
 * list up to the full set the thesis names, organized into the same four
 * categories (General Dentistry, Cosmetic Dentistry, Orthodontics,
 * Specialist Services).
 *
 * Verified against live data before writing this: appointments #6 and #29
 * reference service_id 4, and #7/#30 reference service_id 1 — neither of
 * those two rows is renamed or has its duration changed here, only every
 * OTHER existing row (plus the new ones). id 2 and id 8 ARE renamed/updated
 * in place (same id, per the "don't delete+recreate" requirement) — neither
 * has any appointment referencing it, confirmed via the same check.
 *
 * Durations for the 11 brand-new services are estimates (procedure time +
 * prep/turnaround buffer, rounded to a clean 15-minute increment, matching
 * the convention the original 9 already use) — real clinic-provided
 * durations aren't finalized yet. Implants is deliberately the longest
 * (single placement surgery routinely runs 60–120+ minutes in practice).
 * Braces and Implants each cover two different real-world visit lengths
 * (installation vs. adjustment; consultation vs. surgery) collapsed into
 * one row per the target list — the duration picked leans toward the
 * longer/more demanding visit so the slot system never under-books time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->string('category')->nullable()->after('description');
        });

        $now = now();

        // ---- Rename/update existing rows IN PLACE (same id) ----

        // Thesis: "15-minute procedure allotted 30 minutes with buffer" —
        // our seed had this at 45 minutes; correcting to match. No
        // appointment currently references id 2.
        DB::table('services')->where('id', 2)
            ->where('name', 'Routine Dental Cleaning (Oral Prophylaxis)')
            ->update([
                'name' => 'Cleaning (Oral Prophylaxis)',
                'duration_minutes' => 30,
                'category' => 'General Dentistry',
                'updated_at' => $now,
            ]);

        // Renamed to disambiguate from the new standalone Braces/Aligners/
        // Retainers rows below — "/ Adjustment" no longer belongs on the
        // general consultation entry once those exist separately. No
        // appointment currently references id 8.
        DB::table('services')->where('id', 8)
            ->where('name', 'Orthodontic Consultation / Adjustment')
            ->update([
                'name' => 'Orthodontic Consultation',
                'category' => 'Orthodontics',
                'updated_at' => $now,
            ]);

        // ---- Backfill category on the rest — names/durations untouched,
        // especially ids 1 and 4 (the two with real appointment references) ----
        DB::table('services')->whereIn('id', [1, 3, 4, 5, 6, 7])
            ->update(['category' => 'General Dentistry', 'updated_at' => $now]);

        DB::table('services')->where('id', 9)
            ->update(['category' => 'Cosmetic Dentistry', 'updated_at' => $now]);

        // ---- New services ----
        $newServices = [
            // General Dentistry
            ['name' => 'Crown Placement / Fitting', 'category' => 'General Dentistry', 'duration_minutes' => 60],
            ['name' => 'Denture Fitting / Adjustment', 'category' => 'General Dentistry', 'duration_minutes' => 45],

            // Cosmetic Dentistry
            ['name' => 'Veneer Fitting / Application', 'category' => 'Cosmetic Dentistry', 'duration_minutes' => 90],
            ['name' => 'Gum Recontouring', 'category' => 'Cosmetic Dentistry', 'duration_minutes' => 45],

            // Orthodontics
            ['name' => 'Braces (Installation / Adjustment)', 'category' => 'Orthodontics', 'duration_minutes' => 60],
            ['name' => 'Aligners (Fitting / Consultation)', 'category' => 'Orthodontics', 'duration_minutes' => 45],
            ['name' => 'Retainers (Fitting / Consultation)', 'category' => 'Orthodontics', 'duration_minutes' => 30],

            // Specialist Services
            ['name' => 'Pediatric Dentistry Consultation', 'category' => 'Specialist Services', 'duration_minutes' => 45],
            ['name' => 'Dental Implants (Consultation / Procedure)', 'category' => 'Specialist Services', 'duration_minutes' => 120],
            ['name' => 'TMJ Disorder Consultation', 'category' => 'Specialist Services', 'duration_minutes' => 45],
            ['name' => 'Sedation Dentistry (Consultation)', 'category' => 'Specialist Services', 'duration_minutes' => 30],
        ];

        DB::table('services')->insertOrIgnore(array_map(
            fn (array $s) => [
                'name' => $s['name'],
                'description' => null,
                'category' => $s['category'],
                'duration_minutes' => $s['duration_minutes'],
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            $newServices
        ));
    }

    public function down(): void
    {
        DB::table('services')->where('id', 2)->update([
            'name' => 'Routine Dental Cleaning (Oral Prophylaxis)',
            'duration_minutes' => 45,
            'category' => null,
        ]);

        DB::table('services')->where('id', 8)->update([
            'name' => 'Orthodontic Consultation / Adjustment',
            'category' => null,
        ]);

        DB::table('services')->whereIn('id', [1, 3, 4, 5, 6, 7, 9])->update(['category' => null]);

        DB::table('services')->whereIn('name', [
            'Crown Placement / Fitting',
            'Denture Fitting / Adjustment',
            'Veneer Fitting / Application',
            'Gum Recontouring',
            'Braces (Installation / Adjustment)',
            'Aligners (Fitting / Consultation)',
            'Retainers (Fitting / Consultation)',
            'Pediatric Dentistry Consultation',
            'Dental Implants (Consultation / Procedure)',
            'TMJ Disorder Consultation',
            'Sedation Dentistry (Consultation)',
        ])->delete();

        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
