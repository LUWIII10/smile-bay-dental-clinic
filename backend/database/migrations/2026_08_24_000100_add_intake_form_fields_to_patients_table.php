<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fields from the clinic's paper "Patient Information Record / Dental
     * History" intake form that the registration wizard never collected —
     * civil_status, nationality, guardian name/relationship/contact, blood
     * type, medical_conditions, and previous_surgeries already existed on
     * this table unused; religion and occupation genuinely didn't exist
     * anywhere, and neither did any of the Dental History section. The
     * paper form's "Dental Treatment Consent Form" (per-procedure signature
     * lines) is deliberately NOT modeled here — that's a signed-consent
     * capture, a different kind of feature from patient intake data, and
     * out of scope for this pass.
     */
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->string('religion')->nullable()->after('nationality');
            $table->string('occupation')->nullable()->after('religion');
            $table->string('last_physical_exam')->nullable()->after('previous_surgeries');
            $table->string('physician_name_specialty')->nullable()->after('last_physical_exam');

            // Dental History section
            $table->string('last_dental_visit')->nullable()->after('physician_name_specialty');
            $table->string('last_dental_treatment')->nullable()->after('last_dental_visit');
            $table->string('brushing_frequency')->nullable()->after('last_dental_treatment');
            // Checklist: Braces, Extraction/Oral Surgery, Gum Treatment,
            // Denture/Fixed Bridges/Crown, TMJ Therapy/Bite Adjustment/
            // Dental Appliances.
            $table->json('dental_procedures_history')->nullable()->after('brushing_frequency');
            // Checklist: Pain, Swelling, Bleeding Gums, Loose/moving tooth,
            // Clicking/Locking of jaw, Grinding/Clenching, Difficulty in
            // mouth opening, Bad breath.
            $table->json('current_dental_symptoms')->nullable()->after('dental_procedures_history');
            $table->text('visit_reason')->nullable()->after('current_dental_symptoms');
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropColumn([
                'religion',
                'occupation',
                'last_physical_exam',
                'physician_name_specialty',
                'last_dental_visit',
                'last_dental_treatment',
                'brushing_frequency',
                'dental_procedures_history',
                'current_dental_symptoms',
                'visit_reason',
            ]);
        });
    }
};
