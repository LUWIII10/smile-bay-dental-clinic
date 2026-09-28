<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many times CancellationPolicyService has ever set
 * booking_restricted_at on this patient — that column itself is nullable
 * and gets cleared every time an admin lifts the restriction, so it alone
 * can't answer "has this happened before, how many times" (a lifted
 * restriction reads identically to one that was never triggered at all).
 * This only ever increases — Lift Restriction / Activate never decrement
 * it, matching booking_restricted_at's own one-way escalation.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('patients', 'restriction_count')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->unsignedInteger('restriction_count')->default(0)->after('booking_restricted_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('patients', 'restriction_count')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->dropColumn('restriction_count');
            });
        }
    }
};
