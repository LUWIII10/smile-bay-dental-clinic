<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single-row settings table, same firstOrCreate([], [...]) pattern as
 * ClinicInfo — kept separate from clinic_info on purpose, since this is an
 * ops/security setting, not clinic profile data shown on the public site.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backup_settings', function (Blueprint $table) {
            $table->id();
            // 'off' | 'weekly' | 'monthly' — validated in BackupController,
            // not a DB enum, so a future frequency option never needs a migration.
            $table->string('frequency')->default('off');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backup_settings');
    }
};
