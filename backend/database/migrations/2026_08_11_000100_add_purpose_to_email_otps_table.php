<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// email_otps already serves the registration email-verification flow
// (one row per user, enforced by its unique user_id). Password reset needs
// the exact same hash/expiry/attempts/consumed mechanics, so it reuses this
// table rather than a parallel one — `purpose` just keeps the two flows
// from cross-validating each other's codes.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_otps', function (Blueprint $table) {
            $table->string('purpose')->default('email_verification')->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('email_otps', function (Blueprint $table) {
            $table->dropColumn('purpose');
        });
    }
};
