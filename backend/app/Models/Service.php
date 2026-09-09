<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Service extends Model
{
    protected $fillable = [
        'name',
        'description',
        'category',
        'duration_minutes',
        'is_active',
        'is_pediatric',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_pediatric' => 'boolean',
        ];
    }

    public function appointments(): HasMany
    {
        return $this->hasMany(Appointment::class);
    }

    public function dentists(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'dentist_services', 'service_id', 'dentist_id')->withTimestamps();
    }

    /**
     * Single source of truth for "is this the pediatric service" — used by
     * AppointmentController::store() (forces pending_verification + the
     * pediatric-review email regardless of payment type),
     * PediatricVerificationController, and StaffVerificationController's
     * pediatric gate. Backed by the real `is_pediatric` column (see the
     * 2026_09_09 migration) rather than matching on the name — the old
     * name-based check meant renaming the service (even to fix a typo)
     * silently disabled pediatric review, and a PHP-vs-SQL case-sensitivity
     * mismatch could leave a booking permanently stuck in the wrong queue.
     */
    public function isPediatric(): bool
    {
        return (bool) $this->is_pediatric;
    }
}
