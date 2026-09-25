<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Medicard/Flexicare's logos are hardcoded frontend assets (predates
     * this column) — this backs a real upload for any provider an admin
     * adds afterward, so a new one isn't stuck with only an initials badge.
     */
    public function up(): void
    {
        Schema::table('hmo_providers', function (Blueprint $table) {
            $table->string('logo_path')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('hmo_providers', function (Blueprint $table) {
            $table->dropColumn('logo_path');
        });
    }
};
