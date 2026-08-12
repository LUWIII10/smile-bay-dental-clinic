<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();

            // Structured name (registration wizard collects these individually)
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('suffix')->nullable();

            $table->date('date_of_birth');
            $table->enum('sex', ['male', 'female']);
            $table->string('civil_status')->nullable();
            $table->string('nationality')->nullable();

            // Address
            $table->string('address_line')->nullable();
            $table->string('city')->nullable();
            $table->string('province')->nullable();
            $table->string('zip_code')->nullable();

            // Emergency contact
            $table->string('emergency_contact_name')->nullable();
            $table->string('emergency_contact_number')->nullable();

            // Guardian (conditionally required for minors, enforced at app layer)
            $table->string('guardian_name')->nullable();
            $table->string('guardian_relationship')->nullable();
            $table->string('guardian_contact_number')->nullable();

            // Medical history
            $table->string('blood_type')->nullable();
            $table->text('allergies')->nullable();
            $table->text('current_medications')->nullable();
            $table->json('medical_conditions')->nullable();
            $table->string('medical_conditions_other')->nullable();
            $table->text('previous_surgeries')->nullable();

            // Payment / HMO
            $table->enum('patient_type', ['cash', 'hmo']);
            $table->foreignId('hmo_provider_id')->nullable()->constrained('hmo_providers')->nullOnDelete();
            $table->string('hmo_number')->nullable();

            $table->boolean('consent_certified')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patients');
    }
};
