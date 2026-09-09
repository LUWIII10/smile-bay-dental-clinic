<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lets the upcoming-appointment reminder job check "has this specific
     * appointment already been reminded about?" with a plain indexed query
     * instead of fragile title/body string matching — every other
     * notification (status changes) is fired exactly once at the moment of
     * the event, so this column is only ever set by the reminder job.
     */
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->foreignId('appointment_id')->nullable()->after('user_id')
                ->constrained('appointments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('appointment_id');
        });
    }
};
