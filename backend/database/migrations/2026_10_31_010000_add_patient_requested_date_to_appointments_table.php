<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * When a patient counters the dentist's proposed reschedule date
     * (AppointmentController::proposeReschedule()) with a date of their own,
     * it no longer auto-confirms — it waits for dental assistant/admin
     * review (StaffAppointmentController::reviewRescheduleRequest()).
     * Deliberately separate from dentist_proposed_new_date_at: that column
     * stays untouched as the fallback date if staff declines, and this one
     * alone flags "patient's own counter-request, awaiting staff decision".
     */
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->date('patient_requested_date')->nullable()->after('dentist_reschedule_reason');
            $table->time('patient_requested_time')->nullable()->after('patient_requested_date');
            $table->timestamp('patient_requested_new_date_at')->nullable()->after('patient_requested_time');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['patient_requested_date', 'patient_requested_time', 'patient_requested_new_date_at']);
        });
    }
};
