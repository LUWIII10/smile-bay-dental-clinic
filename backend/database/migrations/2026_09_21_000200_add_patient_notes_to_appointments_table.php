<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Free-text notes the patient provides while booking, describing their
 * concern/symptoms — helps the dentist prepare for the initial assessment
 * ahead of the visit, especially now that the patient-facing service list
 * (see is_patient_bookable) is deliberately generalized. Distinct from the
 * existing cancellation_reason column (also surfaced to staff as "Notes" in
 * AppointmentDetailModal, but only when an appointment was cancelled).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('appointments', 'patient_notes')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->text('patient_notes')->nullable()->after('service_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('appointments', 'patient_notes')) {
            Schema::table('appointments', function (Blueprint $table) {
                $table->dropColumn('patient_notes');
            });
        }
    }
};
