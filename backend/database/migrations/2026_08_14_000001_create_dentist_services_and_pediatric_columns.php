<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 1. dentist_services — which dentists can be booked for which services.
 *    Unique on (dentist_id, service_id) so the seeder's link-up can safely
 *    re-run (insertOrIgnore-style) without duplicate rows.
 * 2. appointments.pediatric_confirmed_at / pediatric_confirmed_by — the
 *    verification GATE for pediatric bookings. Deliberately not a new
 *    status enum value (status stays exactly ['pending_verification',
 *    'confirmed', 'completed', 'cancelled', 'no_show', 'rejected'] as
 *    already defined on the appointments table) — a pediatric appointment
 *    sits in the existing 'pending_verification' status until the
 *    pediatric dentist acts, same enum value cash/HMO already used for
 *    "not yet actionable by staff", just gated by this extra timestamp.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dentist_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['dentist_id', 'service_id']);
        });

        Schema::table('appointments', function (Blueprint $table) {
            $table->timestamp('pediatric_confirmed_at')->nullable()->after('cancellation_reason');
            $table->foreignId('pediatric_confirmed_by')->nullable()->after('pediatric_confirmed_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pediatric_confirmed_by');
            $table->dropColumn('pediatric_confirmed_at');
        });

        Schema::dropIfExists('dentist_services');
    }
};
