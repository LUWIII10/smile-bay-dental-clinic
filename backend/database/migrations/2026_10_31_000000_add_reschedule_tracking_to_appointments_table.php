<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Staff's clinic-wide reschedule (StaffAppointmentController::reschedule()
     * — "Move to Next Open Slot" for a running-late confirmed patient) applies
     * instantly, no patient confirmation, since it's same-day and time
     * critical. These columns let the patient's own appointment list show
     * that it happened and what it used to be, without needing them to check
     * the notification bell or email first.
     */
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->date('previous_appointment_date')->nullable()->after('appointment_time');
            $table->time('previous_appointment_time')->nullable()->after('previous_appointment_date');
            $table->timestamp('last_rescheduled_at')->nullable()->after('previous_appointment_time');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn(['previous_appointment_date', 'previous_appointment_time', 'last_rescheduled_at']);
        });
    }
};
