<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A dentist's optional, per-date opt-in restriction to a subset of the
 * services they're credentialed for (dentist_services) — "only cleanings
 * today". Checked by AppointmentSlotService alongside dentist_day_off/
 * dentist_weekly_hours; no row for a date means no restriction, same
 * "empty by default, nothing changes until a dentist adds one" precedent
 * as dentist_day_off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dentist_service_limits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            $table->timestamps();

            $table->unique(['dentist_id', 'date']);
            $table->index('date');
        });

        Schema::create('dentist_service_limit_service', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_service_limit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();

            $table->unique(['dentist_service_limit_id', 'service_id'], 'svc_limit_service_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dentist_service_limit_service');
        Schema::dropIfExists('dentist_service_limits');
    }
};
