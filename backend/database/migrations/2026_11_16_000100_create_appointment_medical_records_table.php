<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per booked appointment (patient wizard's Medical Record step, or
 * the walk-in modal's equivalent) — never updated after creation. A later
 * visit with different answers is a new row, not an edit of an old one, so
 * whatever a dentist saw and acted on at a past visit stays exactly as it
 * was. patient_id is denormalized (also reachable via appointment_id) so
 * "every medical record for this patient, newest first" doesn't need a
 * join through appointments.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointment_medical_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();

            $table->boolean('high_blood_pressure')->default(false);
            $table->string('high_blood_pressure_notes')->nullable();
            $table->boolean('diabetes')->default(false);
            $table->string('diabetes_notes')->nullable();
            $table->boolean('heart_condition')->default(false);
            $table->string('heart_condition_notes')->nullable();
            $table->boolean('asthma')->default(false);
            $table->string('asthma_notes')->nullable();
            $table->boolean('bleeding_disorder')->default(false);
            $table->string('bleeding_disorder_notes')->nullable();
            $table->boolean('allergies')->default(false);
            $table->string('allergies_notes')->nullable();
            $table->boolean('taking_medications')->default(false);
            $table->string('taking_medications_notes')->nullable();
            $table->boolean('recent_surgery')->default(false);
            $table->string('recent_surgery_notes')->nullable();
            // Null (not just false) when not asked at all — male patients
            // never see this question, so there's no real yes/no to record.
            $table->boolean('pregnant_or_breastfeeding')->nullable();
            $table->string('pregnant_or_breastfeeding_notes')->nullable();

            $table->text('other_concerns')->nullable();
            $table->boolean('consent_given')->default(false);
            $table->timestamp('consent_at')->nullable();

            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointment_medical_records');
    }
};
