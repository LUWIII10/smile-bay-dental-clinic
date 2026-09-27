<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// An on-call dentist (currently just the pediatric dentist) has no fixed
// weekly schedule by design — see AppointmentSlotService::operatingHoursFor(),
// which ignores dentist_weekly_hours entirely for one of these and falls
// back to the clinic-wide default instead. Their own manual approve/reject/
// reschedule (PediatricVerificationController) is what actually gates
// whether a request holds, not a weekly toggle that was never a true
// reflection of when they're actually in the clinic.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dentist_profiles', function (Blueprint $table) {
            $table->boolean('is_on_call')->default(false)->after('years_experience');
        });
    }

    public function down(): void
    {
        Schema::table('dentist_profiles', function (Blueprint $table) {
            $table->dropColumn('is_on_call');
        });
    }
};
