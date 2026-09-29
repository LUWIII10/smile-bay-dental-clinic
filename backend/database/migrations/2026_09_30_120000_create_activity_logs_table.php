<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only system-wide activity trail (admin's "Activity Log" page) —
 * account and booking actions across every role, not just appointment
 * status transitions (that's appointment_status_log's own narrower job).
 * actor_id is nullable: some events are system-triggered rather than a
 * person clicking something (e.g. the automatic 3-strike booking
 * restriction — see CancellationPolicyService), and there's no user to
 * attribute those to. description is pre-rendered plain text at write time,
 * same reasoning as appointment_status_log.note — cheap to read back,
 * doesn't need to re-derive names/services from other tables just to
 * render the log later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->text('description');
            $table->timestamp('created_at')->useCurrent();

            $table->index('action');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
