<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original unique(dentist_id, appointment_date, appointment_time) was
 * meant to stop double-booking, but it applies regardless of status —
 * including to cancelled/rejected rows, which AppointmentSlotService
 * deliberately treats as freeing the slot back up (OCCUPYING_STATUSES
 * excludes them). That mismatch means a cancelled appointment permanently
 * blocks that exact dentist+date+time from ever being reused (walk-in
 * reassignment included), a real conflict that surfaced while testing the
 * All Appointments walk-in feature. Real double-booking prevention already
 * lives entirely in application code (AppointmentSlotService::
 * isSlotAvailable() + the explicit lockForUpdate() inside
 * AppointmentController::store()'s transaction), so the DB constraint was
 * both redundant for occupying rows and actively wrong for freed ones —
 * dropped outright rather than replaced with a conditional/partial unique
 * index (MySQL has no clean support for that short of a generated column).
 * Kept a plain index in its place for the same dentist+date lookup queries
 * (occupiedIntervals(), the dentist schedule view, etc.) still benefit from.
 */
return new class extends Migration
{
    public function up(): void
    {
        // MySQL refuses to drop the unique index in the same statement it's
        // needed to back the dentist_id foreign key — the replacement index
        // has to exist first so the FK always has something to fall back on.
        Schema::table('appointments', function (Blueprint $table) {
            $table->index(['dentist_id', 'appointment_date']);
        });

        Schema::table('appointments', function (Blueprint $table) {
            $table->dropUnique('appointments_dentist_id_appointment_date_appointment_time_unique');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->unique(['dentist_id', 'appointment_date', 'appointment_time']);
        });

        Schema::table('appointments', function (Blueprint $table) {
            $table->dropIndex(['dentist_id', 'appointment_date']);
        });
    }
};
