<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Separates "what a patient can pick in the online booking wizard" from
 * "what's active in the clinic's full service catalog" (is_active). Patients
 * now only see a short list of common, 30-minute, self-service-appropriate
 * entries; the full catalog (including longer procedures like Surgical
 * Extraction or Dental Implants) stays available to staff for walk-in
 * booking and appointment completion, unaffected by this flag. Defaults to
 * false so every existing service stays staff-only until ServiceSeeder
 * explicitly opts a service in.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('services', 'is_patient_bookable')) {
            Schema::table('services', function (Blueprint $table) {
                $table->boolean('is_patient_bookable')->default(false)->after('is_pediatric');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('services', 'is_patient_bookable')) {
            Schema::table('services', function (Blueprint $table) {
                $table->dropColumn('is_patient_bookable');
            });
        }
    }
};
