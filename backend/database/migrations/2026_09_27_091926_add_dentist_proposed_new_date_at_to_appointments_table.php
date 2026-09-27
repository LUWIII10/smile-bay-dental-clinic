<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks whose turn it is to act on a pediatric appointment that's still
 * pending_verification. Null = the normal state (patient's own original
 * request, or the pediatric dentist hasn't touched the date). Set = the
 * pediatric dentist just moved appointment_date/time to a new value (most
 * often because the original date passed with no decision — see the
 * "Needs New Date" tab) and the PATIENT now needs to Accept it or request
 * yet another date. Cleared back to null the moment either side resolves
 * it — accepted (PatientAppointmentController::acceptProposedDate()),
 * countered with another date (::requestDifferentDate(), which hands
 * the turn back to the dentist without needing a second column for that
 * direction — a patient-set date is simply the normal, unmarked state),
 * or the appointment leaves pending_verification entirely (approved,
 * rejected, cancelled).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->timestamp('dentist_proposed_new_date_at')->nullable()->after('pediatric_confirmed_by');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn('dentist_proposed_new_date_at');
        });
    }
};
