<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained('patients')->restrictOnDelete();

            // Nullable: dental assistant may assign a dentist later (approved adjustment)
            $table->foreignId('dentist_id')->nullable()->constrained('users')->nullOnDelete();

            $table->foreignId('service_id')->constrained('services')->restrictOnDelete();

            $table->date('appointment_date');
            $table->time('appointment_time');

            $table->enum('status', [
                'pending_verification',
                'confirmed',
                'completed',
                'cancelled',
                'no_show',
                'rejected',
            ])->default('pending_verification');

            // Snapshot at booking time, since a patient's stored patient_type could change later
            $table->enum('patient_type_snapshot', ['cash', 'hmo']);

            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();

            $table->text('cancellation_reason')->nullable();

            $table->timestamps();

            $table->unique(['dentist_id', 'appointment_date', 'appointment_time']);
            $table->index('status');
            $table->index('appointment_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointments');
    }
};
