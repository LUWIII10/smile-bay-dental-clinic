<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Optional context the pediatric dentist can leave when she proposes a new
// date (PediatricVerificationController::proposeNewDate()) — surfaced to the
// patient alongside the proposed date so they know why, not just that it
// changed. Cleared back to null whenever the proposal is resolved (patient
// accepts or counters), same as dentist_proposed_new_date_at itself — it's
// scoped to that one proposal, not a running log.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->text('dentist_reschedule_reason')->nullable()->after('dentist_proposed_new_date_at');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn('dentist_reschedule_reason');
        });
    }
};
