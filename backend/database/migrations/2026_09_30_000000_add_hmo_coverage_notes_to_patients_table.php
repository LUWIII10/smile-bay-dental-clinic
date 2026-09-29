<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A free-text summary of what the patient's HMO provider actually covers
 * (e.g. "2 extractions/year, 1 cleaning every 6 months") — captured by staff
 * once they've called the provider to verify coverage, since that's the only
 * point in the flow where anyone at the clinic actually learns this. Lives on
 * the patient, not any one appointment, since it's an annual-benefit fact
 * about the person, not something tied to a single visit. Free text on
 * purpose: coverage terms vary too much by provider/procedure to model as
 * rigid structured fields, and staff are transcribing what they're told over
 * the phone, not filling out a form the provider gave them.
 *
 * hmo_coverage_verified_at is separate from cancellation_count_reset_at/
 * booking_restricted_at's own timestamps — it only ever moves forward when
 * staff actually change the notes text (not on every unrelated Edit Info
 * save), so patients and staff can both tell how fresh this information is.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('patients', 'hmo_coverage_notes')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->text('hmo_coverage_notes')->nullable()->after('cancellation_count_reset_at');
                $table->timestamp('hmo_coverage_verified_at')->nullable()->after('hmo_coverage_notes');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('patients', 'hmo_coverage_notes')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->dropColumn(['hmo_coverage_notes', 'hmo_coverage_verified_at']);
            });
        }
    }
};
