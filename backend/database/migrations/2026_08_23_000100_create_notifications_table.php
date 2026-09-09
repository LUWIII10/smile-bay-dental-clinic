<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * In-app notifications (topbar bell), all four roles — deliberately a
     * plain custom table rather than Laravel's built-in polymorphic
     * notifications system (User already carries the unused Notifiable
     * trait, but nothing in this app has ever called ->notify()): every
     * notification here always belongs to exactly one App\Models\User, so
     * the generic notifiable_type/notifiable_id columns would just be dead
     * weight, and a plain user_id foreign key matches how the rest of this
     * app already models "belongs to one user" (e.g. dentist_profiles).
     */
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('body')->nullable();
            $table->string('url')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
