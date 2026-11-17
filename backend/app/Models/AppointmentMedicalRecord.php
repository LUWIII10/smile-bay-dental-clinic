<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable snapshot per booked appointment — see the migration's own
 * doc comment for why this is never updated after creation. No $fillable
 * list (every field is written once, by AppointmentController::store()'s
 * own trusted payload, never from a raw mass-assign of user input).
 */
class AppointmentMedicalRecord extends Model
{
    const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'high_blood_pressure' => 'boolean',
            'diabetes' => 'boolean',
            'heart_condition' => 'boolean',
            'asthma' => 'boolean',
            'bleeding_disorder' => 'boolean',
            'allergies' => 'boolean',
            'taking_medications' => 'boolean',
            'recent_surgery' => 'boolean',
            'pregnant_or_breastfeeding' => 'boolean',
            'consent_given' => 'boolean',
            'consent_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    // The fixed question order every display (patient's own view, staff
    // Patient Records, the quick-check panel) renders in — one place to
    // change it instead of four.
    public const QUESTIONS = [
        'high_blood_pressure' => 'High blood pressure (hypertension)',
        'diabetes' => 'Diabetes',
        'heart_condition' => 'Heart condition',
        'asthma' => 'Asthma or breathing problems',
        'bleeding_disorder' => 'Bleeding disorder',
        'allergies' => 'Allergies (medications, food, latex)',
        'taking_medications' => 'Currently taking medications',
        'recent_surgery' => 'Recent surgery or hospitalization',
        'pregnant_or_breastfeeding' => 'Pregnant or breastfeeding',
    ];

    // Shared by StoreAppointmentRequest (patient-facing booking) and
    // StaffAppointmentController::assignWalkIn() (staff booking on a
    // patient's behalf) — one rule set so the two flows can't silently
    // drift apart. $prefix is the request field the form data is nested
    // under ("medical_record" in both current callers).
    public static function validationRules(string $prefix = 'medical_record'): array
    {
        $rules = [
            $prefix => ['required', 'array'],
            "{$prefix}.pregnant_or_breastfeeding" => ['nullable', 'boolean'],
            "{$prefix}.pregnant_or_breastfeeding_notes" => ['nullable', 'string', 'max:500'],
            "{$prefix}.other_concerns" => ['nullable', 'string', 'max:1000'],
            "{$prefix}.consent_given" => ['required', 'accepted'],
        ];

        foreach (array_keys(self::QUESTIONS) as $key) {
            if ($key === 'pregnant_or_breastfeeding') {
                continue;
            }
            $rules["{$prefix}.{$key}"] = ['required', 'boolean'];
            $rules["{$prefix}.{$key}_notes"] = ['nullable', 'string', 'max:500'];
        }

        return $rules;
    }

    // Maps a validated medical_record.* sub-array (same shape on every
    // caller — see validationRules() above) onto this table's columns.
    // Shared by AppointmentController::store() and
    // StaffAppointmentController::assignWalkIn() so both create rows the
    // same way.
    public static function attributesFromAnswers(array $answers, int $appointmentId, int $patientId): array
    {
        $attributes = [
            'appointment_id' => $appointmentId,
            'patient_id' => $patientId,
            'pregnant_or_breastfeeding' => $answers['pregnant_or_breastfeeding'] ?? null,
            'pregnant_or_breastfeeding_notes' => $answers['pregnant_or_breastfeeding_notes'] ?? null,
            'other_concerns' => $answers['other_concerns'] ?? null,
            'consent_given' => $answers['consent_given'],
            'consent_at' => $answers['consent_given'] ? now() : null,
        ];

        foreach (array_keys(self::QUESTIONS) as $key) {
            if ($key === 'pregnant_or_breastfeeding') {
                continue;
            }
            $attributes[$key] = $answers[$key];
            $attributes["{$key}_notes"] = $answers["{$key}_notes"] ?? null;
        }

        return $attributes;
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    // Question keys answered "yes" on this record — drives both the staff
    // alert badges and ClinicalSafetyService's own rule check.
    public function flaggedConditions(): array
    {
        return array_values(array_filter(array_keys(self::QUESTIONS), fn ($key) => (bool) $this->{$key}));
    }
}
