<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Replaces the old `str_contains($name, 'Pediatric')` gate (Service::
 * isPediatric()) with a real, explicit column. The name-matching approach
 * had two live bugs: an admin renaming the pediatric service (even to fix a
 * typo) silently turned off pediatric-dentist review entirely, and a
 * case-sensitivity mismatch between the PHP check (case-sensitive) and a
 * SQL `LIKE` filter elsewhere (case-insensitive) could leave an HMO booking
 * permanently stuck, invisible to the staff verification queue. Backfills
 * from the existing name-match so current behavior doesn't change for any
 * already-seeded service — going forward, this column is the single source
 * of truth, not the name.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('services', 'is_pediatric')) {
            Schema::table('services', function (Blueprint $table) {
                $table->boolean('is_pediatric')->default(false)->after('category');
            });
        }

        DB::table('services')->where('name', 'like', '%Pediatric%')->update(['is_pediatric' => true]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('services', 'is_pediatric')) {
            Schema::table('services', function (Blueprint $table) {
                $table->dropColumn('is_pediatric');
            });
        }
    }
};
