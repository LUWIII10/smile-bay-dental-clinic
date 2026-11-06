<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per backup attempt (not just the successful ones) — a failed
 * attempt still needs to show up in the history list so an admin can see
 * something went wrong, not just silently miss a scheduled backup.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('database_backups', function (Blueprint $table) {
            $table->id();
            // Empty until the dump actually finishes — see DatabaseBackupService::generate().
            $table->string('filename')->default('');
            // 'weekly' | 'monthly' | 'manual' — which retention bucket this
            // counts against (DatabaseBackupService::RETENTION) and what the
            // history list's badge reads.
            $table->string('frequency_tag');
            $table->unsignedBigInteger('size_bytes')->nullable();
            // 'running' | 'completed' | 'failed'.
            $table->string('status')->default('running');
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['frequency_tag', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('database_backups');
    }
};
