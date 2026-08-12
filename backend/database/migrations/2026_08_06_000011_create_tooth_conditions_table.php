<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Current per-tooth state (Universal Numbering System, teeth 1-32).
     * Edited by dentists only (enforced at the authorization layer).
     */
    public function up(): void
    {
        Schema::create('tooth_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dental_record_id')->constrained('dental_records')->cascadeOnDelete();
            $table->unsignedTinyInteger('tooth_number');
            $table->enum('condition', [
                'healthy',
                'decayed',
                'filled',
                'missing',
                'crowned',
                'root_canal',
                'extracted',
                'impacted',
                'other',
            ])->default('healthy');
            $table->text('notes')->nullable();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->unique(['dental_record_id', 'tooth_number']);
        });

        DB::statement('ALTER TABLE tooth_conditions ADD CONSTRAINT chk_tooth_number_range CHECK (tooth_number BETWEEN 1 AND 32)');
    }

    public function down(): void
    {
        Schema::dropIfExists('tooth_conditions');
    }
};
