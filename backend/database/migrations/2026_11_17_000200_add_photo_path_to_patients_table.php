<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A dependent has no `users` row to hang a photo off of the way every
// other role's avatar does (users.avatar_path / dentist_profiles.
// photo_path) — this column is where a dependent's own photo lives
// instead. Added on `patients` generally (not a dependents-only table)
// since it costs nothing on an ordinary patient row, but today only
// DependentController's upload/remove actions ever write to it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->string('photo_path')->nullable()->after('relationship_to_parent');
        });
    }

    public function down(): void
    {
        Schema::table('patients', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
