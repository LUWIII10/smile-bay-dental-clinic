<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two additions to the existing follow-up recommendation feature:
 *
 * - recommended_follow_up_window: an optional, purely informational label
 *   ("1-2 weeks", "1 month", ...) shown to the patient alongside an ACTIVE
 *   recommendation — never used in any availability/scheduling query, the
 *   patient still picks their own exact date+time as before.
 * - dentist_suggested_follow_up_service_id / dentist_suggested_follow_up_window:
 *   lets the dentist flag a follow-up while completing the visit
 *   (AppointmentController::complete()), without it taking effect for the
 *   patient yet — staff still review and click "Enable Follow-up"
 *   (StaffAppointmentController::enableFollowUp()) to actually activate it,
 *   same as today. Kept entirely separate from recommended_follow_up_* (the
 *   ACTIVE one) so a dentist's suggestion never silently opens a booking
 *   option without staff having acted on it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (! Schema::hasColumn('appointments', 'recommended_follow_up_window')) {
                $table->string('recommended_follow_up_window')->nullable()->after('recommended_follow_up_service_id');
            }
            if (! Schema::hasColumn('appointments', 'dentist_suggested_follow_up_service_id')) {
                $table->foreignId('dentist_suggested_follow_up_service_id')->nullable()->after('follow_up_fulfilled_at')
                    ->constrained('services')->nullOnDelete();
            }
            if (! Schema::hasColumn('appointments', 'dentist_suggested_follow_up_window')) {
                $table->string('dentist_suggested_follow_up_window')->nullable()->after('dentist_suggested_follow_up_service_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (Schema::hasColumn('appointments', 'dentist_suggested_follow_up_window')) {
                $table->dropColumn('dentist_suggested_follow_up_window');
            }
            if (Schema::hasColumn('appointments', 'dentist_suggested_follow_up_service_id')) {
                $table->dropConstrainedForeignId('dentist_suggested_follow_up_service_id');
            }
            if (Schema::hasColumn('appointments', 'recommended_follow_up_window')) {
                $table->dropColumn('recommended_follow_up_window');
            }
        });
    }
};
