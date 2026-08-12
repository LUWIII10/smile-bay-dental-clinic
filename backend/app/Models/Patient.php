<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Patient extends Model
{
    protected $fillable = [
        'user_id',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'date_of_birth',
        'sex',
        'civil_status',
        'nationality',
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
        'patient_type',
        'hmo_provider_id',
        'hmo_number',
        'hmo_company_name',
        'consent_certified',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'medical_conditions' => 'array',
            'consent_certified' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
