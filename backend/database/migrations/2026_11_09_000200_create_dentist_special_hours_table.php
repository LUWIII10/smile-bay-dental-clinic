<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A dentist's own opt-in to a date Settings > Special Opening Dates has
// already opened clinic-wide (clinic_special_hours) — the inverse of
// dentist_day_off. Opening the clinic for a date never makes any dentist
// bookable by itself; each dentist decides individually, same as their
// own regular weekly hours.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dentist_special_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();

            $table->unique(['dentist_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dentist_special_hours');
    }
};
