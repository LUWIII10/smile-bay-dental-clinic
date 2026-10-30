<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets staff explicitly free a still-pending_verification appointment's
 * slot (an HMO/pediatric request whose requested date+time has already
 * lapsed without approval) so it can be booked by someone else — without
 * rejecting or cancelling the original request, which stays pending and
 * gets a new date once resolved. AppointmentSlotService excludes a row
 * with this set from its occupancy checks; nothing else reads it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->timestamp('slot_released_at')->nullable()->after('hmo_status_updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropColumn('slot_released_at');
        });
    }
};
