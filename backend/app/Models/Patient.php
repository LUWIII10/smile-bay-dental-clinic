<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Patient extends Model
{
    protected $fillable = [
        'user_id',
        'patient_number',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'date_of_birth',
        'sex',
        'civil_status',
        'nationality',
        'religion',
        'occupation',
        'address_line',
        'city',
        'province',
        'zip_code',
        'emergency_contact_name',
        'emergency_contact_relationship',
        'emergency_contact_number',
        'guardian_name',
        'guardian_relationship',
        'guardian_contact_number',
        'blood_type',
        'allergies',
        'current_medications',
        'medical_conditions',
        'medical_conditions_other',
        'previous_surgeries',
        'last_physical_exam',
        'physician_name_specialty',
        'last_dental_visit',
        'last_dental_treatment',
        'brushing_frequency',
        'dental_procedures_history',
        'current_dental_symptoms',
        'visit_reason',
        'patient_type',
        'hmo_provider_id',
        'hmo_number',
        'hmo_company_name',
        'consent_certified',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date:Y-m-d',
            'medical_conditions' => 'array',
            'dental_procedures_history' => 'array',
            'current_dental_symptoms' => 'array',
            'consent_certified' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function hmoProvider(): BelongsTo
    {
        return $this->belongsTo(HmoProvider::class);
    }

    public function dentalRecord(): HasOne
    {
        return $this->hasOne(DentalRecord::class);
    }

    /**
     * "PT-{registration year}-{sequence}" — sequence is this row's own
     * auto-increment id, zero-padded to 4 digits (grows naturally past
     * 9999 without any special-casing — str_pad never truncates). Using
     * the id directly means MySQL's own auto-increment is the uniqueness/
     * concurrency guarantee, with no separate counter table or locking
     * needed. The year is a snapshot of when THIS patient registered, not
     * a per-year-reset counter — two different patients can never collide
     * on the same sequence number regardless of what year appears in
     * their string, and staff can always say "patient 214" unambiguously
     * without also having to know which year.
     */
    public static function formatPatientNumber(int $id, \DateTimeInterface $registeredAt): string
    {
        return 'PT-'.$registeredAt->format('Y').'-'.str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }
}
