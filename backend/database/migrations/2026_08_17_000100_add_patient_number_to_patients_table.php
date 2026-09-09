<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "PT-2026-0001" style patient number — see Patient::assignPatientNumber()
 * for the exact format decision (continuously-incrementing sequence, not
 * per-year-reset — a real clinic MRN-style identifier should stay a stable,
 * unambiguous reference for a patient's whole history; embedding the
 * registration year in the string is enough for readability without a
 * second patient ever colliding on "patient #47").
 *
 * Nullable at the schema level: existing patients need the one-time
 * backfill command (php artisan patients:backfill-numbers) to get theirs —
 * new registrations always set it in the same transaction as the patient
 * row itself (AuthController::register), so in practice it's never null
 * going forward once that backfill has run once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->string('patient_number')->nullable()->unique()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropUnique(['patient_number']);
            $table->dropColumn('patient_number');
        });
    }
};
