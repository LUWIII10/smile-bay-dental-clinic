<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Ledger of procedures actually completed. Recorded by dentists only
     * (enforced at the authorization layer).
     */
    public function up(): void
    {
        Schema::create('treatment_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dental_record_id')->constrained('dental_records')->cascadeOnDelete();
            $table->foreignId('treatment_plan_item_id')->nullable()->constrained('treatment_plan_items')->nullOnDelete();
            $table->foreignId('appointment_id')->nullable()->constrained('appointments')->nullOnDelete();
            $table->unsignedTinyInteger('tooth_number')->nullable();
            $table->string('procedure_name');
            $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            $table->date('performed_at');
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        DB::statement('ALTER TABLE treatment_history ADD CONSTRAINT chk_history_tooth_number_range CHECK (tooth_number IS NULL OR tooth_number BETWEEN 1 AND 32)');
    }

    public function down(): void
    {
        Schema::dropIfExists('treatment_history');
    }
};
