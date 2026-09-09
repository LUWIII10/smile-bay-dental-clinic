<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Safe to run even though a prior migration already added `category` in
 * this environment — hasColumn guard means this only actually does
 * something in an environment that never ran that one (e.g. a fresh
 * `migrate:fresh`), and no-ops otherwise. Doesn't touch any row data;
 * ServiceSeeder is what populates category values.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('services', 'category')) {
            Schema::table('services', function (Blueprint $table) {
                $table->string('category')->nullable()->after('description');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('services', 'category')) {
            Schema::table('services', function (Blueprint $table) {
                $table->dropColumn('category');
            });
        }
    }
};
