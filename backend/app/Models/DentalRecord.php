<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DentalRecord extends Model
{
    protected $fillable = [
        'patient_id',
        'primary_dentist_id',
        'record_number',
        'opened_at',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'date:Y-m-d',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function primaryDentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'primary_dentist_id');
    }

    public function clinicalNotes(): HasMany
    {
        return $this->hasMany(ClinicalNote::class);
    }

    public function toothConditions(): HasMany
    {
        return $this->hasMany(ToothCondition::class);
    }

    public function treatmentPlans(): HasMany
    {
        return $this->hasMany(TreatmentPlan::class);
    }

    public function treatmentHistory(): HasMany
    {
        return $this->hasMany(TreatmentHistory::class);
    }

    /**
     * "DR-{year opened}-{sequence}" — same pattern as
     * Patient::formatPatientNumber(): the row's own auto-increment id,
     * zero-padded, so MySQL's own auto-increment is the uniqueness/
     * concurrency guarantee with no separate counter table.
     */
    public static function formatRecordNumber(int $id, \DateTimeInterface $openedAt): string
    {
        return 'DR-'.$openedAt->format('Y').'-'.str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }
}
