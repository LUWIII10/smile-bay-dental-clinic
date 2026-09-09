<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-dentist weekly operating hours (0=Sunday..6=Saturday, same convention
 * as clinic_schedules). Introduces the "My Availability" feature — each
 * dentist can now customize their own hours instead of every dentist
 * sharing one clinic-wide schedule. clinic_schedules itself is untouched
 * and stays as AppointmentSlotService's fallback for any dentist who
 * somehow has no rows here yet (shouldn't happen post-seed, but the
 * service checks defensively rather than assuming).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dentist_weekly_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('day_of_week')->comment('0=Sunday .. 6=Saturday');
            $table->boolean('is_active')->default(true);
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->timestamps();

            $table->unique(['dentist_id', 'day_of_week']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dentist_weekly_hours');
    }
};
