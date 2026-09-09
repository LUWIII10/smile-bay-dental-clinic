<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Self-service profile picture, all four roles. Dentists keep using
     * dentist_profiles.photo_path instead (already wired into the public
     * booking/appointment views) — this column backs everyone else's
     * sidebar/topbar avatar, and Admin/Assistant/Patient have no equivalent
     * column anywhere else.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable()->after('mobile_number');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('avatar_path');
        });
    }
};
