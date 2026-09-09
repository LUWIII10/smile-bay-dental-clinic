<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One-off closures on top of a dentist's weekly hours (e.g. a conference or
 * personal day) — checked first in AppointmentSlotService, ahead of the
 * weekly pattern, so a day-off wins even on an otherwise-active weekday.
 * Empty by default; nothing changes for any dentist until they add one.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Table name deliberately singular ("day_off", not "day_offs") per
        // the approved spec — the DentistDayOff model sets $table explicitly
        // since Eloquent's own pluralization would otherwise guess "offs".
        Schema::create('dentist_day_off', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->unique(['dentist_id', 'date']);
            $table->index('date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dentist_day_off');
    }
};
