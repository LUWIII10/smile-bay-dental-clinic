<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The 3-strike cancellation count is otherwise a lifetime tally with no way
 * back to 0 — after an admin lifts a restriction (or reactivates a
 * deactivated account), the patient should get a genuine clean slate on the
 * strike count itself, not just have the block removed while still sitting
 * at "3 cancellations" (which would immediately look wrong, and re-trigger
 * on their very next cancellation regardless of behavior since). Only
 * cancellations AFTER this timestamp count going forward — null means "all
 * of them", the original all-time behavior, so an account that's never been
 * reset behaves exactly as before. restriction_count (added separately) is
 * NOT reset by this — that one stays a permanent, never-cleared history of
 * how many times this has ever happened, on purpose.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('patients', 'cancellation_count_reset_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->timestamp('cancellation_count_reset_at')->nullable()->after('restriction_count');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('patients', 'cancellation_count_reset_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->dropColumn('cancellation_count_reset_at');
            });
        }
    }
};
