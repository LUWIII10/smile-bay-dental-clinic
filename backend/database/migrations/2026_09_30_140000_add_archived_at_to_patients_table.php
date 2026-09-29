<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Archive" for dormant patients — modeled on how real dental practice
 * management systems (e.g. Open Dental) separate this from Inactive:
 * Inactive/Restricted (already in this app) describe account STANDING —
 * can they log in, can they self-book. Archived is orthogonal to that —
 * a patient who hasn't visited in a long time and is unlikely to come
 * back, hidden from the default User Management list so staff aren't
 * scrolling past people who aren't coming in, without deleting anything.
 * A patient's own login/status is completely untouched by this.
 *
 * archived_by/archive_reason exist purely so admin has a record of who
 * archived someone and why, shown on the Archived filter view — archiving
 * itself is always a deliberate, manual action (never automatic), so
 * there's always a real admin to attribute it to.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('patients', 'archived_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->timestamp('archived_at')->nullable()->after('hmo_coverage_verified_at');
                $table->foreignId('archived_by')->nullable()->after('archived_at')->constrained('users')->nullOnDelete();
                $table->text('archive_reason')->nullable()->after('archived_by');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('patients', 'archived_at')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->dropConstrainedForeignId('archived_by');
                $table->dropColumn(['archived_at', 'archive_reason']);
            });
        }
    }
};
