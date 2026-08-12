<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The hmo_providers table (2026_08_06_000001) was created empty — this seeds
// the default options the registration wizard's HMO dropdown needs. Uses
// insertOrIgnore against the table's unique `name` column so re-running
// migrations after a partial seed never throws a duplicate-key error.
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('hmo_providers')->insertOrIgnore([
            ['name' => 'Medicard', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Flexicare', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Other', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        DB::table('hmo_providers')->whereIn('name', ['Medicard', 'Flexicare', 'Other'])->delete();
    }
};
