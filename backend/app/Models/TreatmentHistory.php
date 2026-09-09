<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TreatmentHistory extends Model
{
    // Eloquent would otherwise guess "treatment_histories" (pluralizing
    // "history" -> "histories") — the migration created "treatment_history".
    protected $table = 'treatment_history';

    protected $fillable = [
        'dental_record_id',
        'treatment_plan_item_id',
        'appointment_id',
        'tooth_number',
        'procedure_name',
        'performed_by',
        'performed_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'performed_at' => 'date',
        ];
    }

    public function dentalRecord(): BelongsTo
    {
        return $this->belongsTo(DentalRecord::class);
    }

    public function treatmentPlanItem(): BelongsTo
    {
        return $this->belongsTo(TreatmentPlanItem::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
