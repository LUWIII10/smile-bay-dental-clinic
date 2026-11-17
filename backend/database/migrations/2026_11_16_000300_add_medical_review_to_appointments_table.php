<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clinical safety review — separate from the existing HMO verification
 * (patient_type_snapshot='hmo' + status=pending_verification): this can
 * force pending_verification even for a Cash booking, when
 * ClinicalSafetyService flags a conflict between the Medical Record
 * answers and the chosen service (e.g. pregnancy + an X-ray). Reviewed by
 * the assigned dentist only — a clinical judgment call, not an insurance
 * one, so it's a separate queue from StaffVerificationController's.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->boolean('medical_review_required')->default(false)->after('patient_type_snapshot');
            // pending while awaiting the dentist's decision; set once decided.
            $table->string('medical_review_status')->nullable()->after('medical_review_required');
            // approved_as_scheduled | suggest_alternative | reschedule_later | declined
            $table->string('medical_review_action')->nullable()->after('medical_review_status');
            $table->text('medical_review_notes')->nullable()->after('medical_review_action');
            $table->foreignId('medical_reviewed_by')->nullable()->after('medical_review_notes')->constrained('users')->nullOnDelete();
            $table->timestamp('medical_reviewed_at')->nullable()->after('medical_reviewed_by');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropForeign(['medical_reviewed_by']);
            $table->dropColumn([
                'medical_review_required',
                'medical_review_status',
                'medical_review_action',
                'medical_review_notes',
                'medical_reviewed_by',
                'medical_reviewed_at',
            ]);
        });
    }
};
