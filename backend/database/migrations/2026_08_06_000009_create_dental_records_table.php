<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dental_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->unique()->constrained('patients')->restrictOnDelete();
            $table->foreignId('primary_dentist_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('record_number')->unique();
            $table->date('opened_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dental_records');
    }
};
