<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Book a Follow-up" (Option 2 of the TC's two proposals): a dental
 * assistant enables a specific procedure for a specific patient after their
 * visit; the patient then books it themselves through the real doctor +
 * date/time wizard (same duration-aware slot engine as a regular booking —
 * no separate "date only, staff assigns time" subsystem, no window where a
 * slot is reserved but not yet real).
 *
 * The four columns below live on the RECOMMENDING appointment (the
 * completed visit after which the follow-up was flagged):
 * - recommended_follow_up_service_id / follow_up_recommended_by /
 *   follow_up_recommended_at: set once, by StaffFollowUpController::enable().
 * - follow_up_fulfilled_at: set once a new appointment actually consumes the
 *   recommendation (FollowUpRecommendationService) — this is what makes the
 *   recommendation "used up" so it can't be booked twice, from any path.
 *
 * fulfills_appointment_id lives on the NEW appointment instead (self-
 * referencing FK) — it points back at the recommending appointment above,
 * so both directions of the relationship are queryable without a join
 * through a separate pivot table for what is, at most, a 1:1 link.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            if (! Schema::hasColumn('appointments', 'recommended_follow_up_service_id')) {
                $table->foreignId('recommended_follow_up_service_id')->nullable()->after('patient_notes')
                    ->constrained('services')->nullOnDelete();
            }
            if (! Schema::hasColumn('appointments', 'follow_up_recommended_by')) {
                $table->foreignId('follow_up_recommended_by')->nullable()->after('recommended_follow_up_service_id')
                    ->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('appointments', 'follow_up_recommended_at')) {
                $table->timestamp('follow_up_recommended_at')->nullable()->after('follow_up_recommended_by');
            }
            if (! Schema::hasColumn('appointments', 'follow_up_fulfilled_at')) {
                $table->timestamp('follow_up_fulfilled_at')->nullable()->after('follow_up_recommended_at');
            }
            if (! Schema::hasColumn('appointments', 'fulfills_appointment_id')) {
                $table->foreignId('fulfills_appointment_id')->nullable()->after('follow_up_fulfilled_at')
                    ->constrained('appointments')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            foreach ([
                'fulfills_appointment_id',
                'follow_up_fulfilled_at',
                'follow_up_recommended_at',
                'follow_up_recommended_by',
                'recommended_follow_up_service_id',
            ] as $column) {
                if (Schema::hasColumn('appointments', $column)) {
                    if (in_array($column, ['fulfills_appointment_id', 'follow_up_recommended_by', 'recommended_follow_up_service_id'], true)) {
                        $table->dropConstrainedForeignId($column);
                    } else {
                        $table->dropColumn($column);
                    }
                }
            }
        });
    }
};
