<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// One-off dates the clinic opens OUTSIDE its normal weekly Operating Hours
// (e.g. a single extra Sunday) — the inverse of clinic_closures, which
// closes a normally-open date instead. Checked in AppointmentSlotService::
// operatingHoursFor() only once the regular weekly schedule says a date is
// closed. Opening a date here never makes any dentist automatically
// bookable by itself — see dentist_special_hours, each dentist's own
// opt-in on top of this, same "clinic hours are the outer envelope, each
// dentist still decides" principle as their regular weekly hours.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_special_hours', function (Blueprint $table) {
            $table->id();
            $table->date('date')->unique();
            $table->time('open_time');
            $table->time('close_time');
            $table->text('reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_special_hours');
    }
};
