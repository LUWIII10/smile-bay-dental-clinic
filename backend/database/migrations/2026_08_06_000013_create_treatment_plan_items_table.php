<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('treatment_plan_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('treatment_plan_id')->constrained('treatment_plans')->cascadeOnDelete();
            $table->unsignedTinyInteger('tooth_number')->nullable();
            $table->string('procedure_name');
            $table->enum('status', ['pending', 'completed', 'cancelled'])->default('pending');
            $table->unsignedInteger('sequence')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        DB::statement('ALTER TABLE treatment_plan_items ADD CONSTRAINT chk_plan_item_tooth_number_range CHECK (tooth_number IS NULL OR tooth_number BETWEEN 1 AND 32)');
    }

    public function down(): void
    {
        Schema::dropIfExists('treatment_plan_items');
    }
};
