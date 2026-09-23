<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "3-strike" cancellation policy — a deliberately separate, patient-only
 * concept from users.status (which is shared by every role and already
 * blocks login entirely via EnsureUserHasRole). booking_restricted_at is a
 * softer, earlier stage: the patient can still log in and use the portal
 * normally, they just can't submit a NEW booking (AppointmentController::
 * store() checks this) until staff clears it. Reaching this point
 * automatically (PatientAppointmentController::cancel()) is the warning
 * shot; cancelling again after it is what actually deactivates the account
 * (via the existing users.status mechanism, not a new one).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('patients', 'booking_restricted_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->timestamp('booking_restricted_at')->nullable()->after('patient_type');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('patients', 'booking_restricted_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->dropColumn('booking_restricted_at');
            });
        }
    }
};
