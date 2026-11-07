<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Records which staff member created a walk-in booking on a patient's
// behalf (StaffAppointmentController::assignWalkIn()) — null for every
// appointment a patient booked through the portal themselves, same as
// verified_by is only ever set once staff actually review an HMO booking.
// Lets AppointmentConfirmedMail show "Booked by: <staff name>" only when
// there's actually someone to attribute it to.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->foreignId('booked_by')->nullable()->after('dentist_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('booked_by');
        });
    }
};
