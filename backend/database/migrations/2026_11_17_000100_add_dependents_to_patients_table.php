<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// A minor dependent is just another `patients` row with no login of its
// own: user_id is null, parent_patient_id points at the parent account's
// own patient row, and is_dependent marks it as such. Every existing
// feature keyed off patient_id (appointments, medical records, dental
// records, Patient Records search) works for a dependent automatically
// with no schema changes of its own — this migration only has to make
// user_id nullable (raw SQL — doctrine/dbal isn't installed, so
// ->change() isn't available) and add the three new columns.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE patients MODIFY user_id BIGINT UNSIGNED NULL');

        Schema::table('patients', function (Blueprint $table) {
            $table->foreignId('parent_patient_id')->nullable()->after('user_id')
                ->constrained('patients')->nullOnDelete();
            $table->boolean('is_dependent')->default(false)->after('parent_patient_id');
            $table->string('relationship_to_parent')->nullable()->after('is_dependent');
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_patient_id');
            $table->dropColumn(['is_dependent', 'relationship_to_parent']);
        });

        DB::statement('ALTER TABLE patients MODIFY user_id BIGINT UNSIGNED NOT NULL');
    }
};
