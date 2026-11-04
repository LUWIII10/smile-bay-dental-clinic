<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One-off, clinic-wide closures on top of the weekly Operating Hours
 * schedule (e.g. a holiday or staff event) — same shape as
 * dentist_day_off, but with no dentist_id since this closes the clinic for
 * every dentist at once. Checked first in
 * AppointmentSlotService::operatingHoursFor(), ahead of even a dentist's
 * own day-off, so a clinic closure always wins. Empty by default; nothing
 * changes until an admin adds one via Settings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_closures', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->text('reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_closures');
    }
};
