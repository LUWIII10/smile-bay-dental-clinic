<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * StaffVerificationController::sendStatusUpdate() previously only sent
     * an email + an in-app notification — neither persists anywhere the
     * patient's own "My Appointments" page can read back later, so the
     * update was gone the moment the email/notification was dismissed.
     * These three columns are the actual source of truth the portal reads
     * from; the email and notification are just the "hey, check the
     * portal" nudge on top of it.
     */
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->string('hmo_status_label')->nullable()->after('cancellation_reason');
            $table->text('hmo_status_note')->nullable()->after('hmo_status_label');
            $table->timestamp('hmo_status_updated_at')->nullable()->after('hmo_status_note');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['hmo_status_label', 'hmo_status_note', 'hmo_status_updated_at']);
        });
    }
};
