<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Admin-configurable tags (Settings > Services, same pattern as the
 * existing is_pediatric flag) that ClinicalSafetyService checks a booking's
 * Medical Record answers against — e.g. a pregnant patient booking a
 * service tagged involves_xray gets flagged for a dentist's review instead
 * of auto-confirming. All default false: existing services are unaffected
 * until an admin explicitly tags one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->boolean('involves_xray')->default(false)->after('is_pediatric');
            $table->boolean('involves_sedation')->default(false)->after('involves_xray');
            $table->boolean('is_surgical')->default(false)->after('involves_sedation');
        });
    }

    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn(['involves_xray', 'involves_sedation', 'is_surgical']);
        });
    }
};
