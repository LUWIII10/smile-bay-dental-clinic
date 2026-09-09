<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
    'name',
    'email',
    'password',
    'role',
    'status',
    'mobile_number',
    'avatar_path',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function patient(): HasOne
    {
        return $this->hasOne(Patient::class);
    }

    public function dentistProfile(): HasOne
    {
        return $this->hasOne(DentistProfile::class);
    }

    // Appointments where this user is the assigned dentist (role=dentist).
    public function dentistAppointments(): HasMany
    {
        return $this->hasMany(Appointment::class, 'dentist_id');
    }

    // Services this dentist is credentialed to perform (role=dentist) —
    // e.g. the pediatric dentist is linked ONLY to the pediatric service,
    // Ramirez/Castro to everything else. See dentist_services pivot.
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'dentist_services', 'dentist_id', 'service_id')->withTimestamps();
    }

    // Structural check ("credentialed only for the pediatric service"), not
    // a specialization string-match — matches the same real rule
    // PediatricDentistSeeder sets up and PediatricVerificationController
    // relies on. Drives the "Pediatric Queue" sidebar link: Ramirez/Castro
    // are also role=dentist but aren't pediatric-credentialed, so this is
    // false for them even though the raw role can't tell the difference.
    public function isPediatricDentist(): bool
    {
        if ($this->role !== 'dentist') {
            return false;
        }

        $credentialed = $this->services()->get();

        return $credentialed->isNotEmpty() && $credentialed->every(fn (Service $service) => $service->isPediatric());
    }
}
