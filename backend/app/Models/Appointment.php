<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appointment extends Model
{
    protected $fillable = [
        'patient_id',
        'dentist_id',
        'service_id',
        'appointment_date',
        'appointment_time',
        'status',
        'patient_type_snapshot',
        'verified_by',
        'verified_at',
        'cancellation_reason',
        'pediatric_confirmed_at',
        'pediatric_confirmed_by',
        'hmo_status_label',
        'hmo_status_note',
        'hmo_status_updated_at',
    ];

    protected function casts(): array
    {
        return [
            'appointment_date' => 'date',
            'verified_at' => 'datetime',
            'pediatric_confirmed_at' => 'datetime',
            'hmo_status_updated_at' => 'datetime',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function pediatricConfirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pediatric_confirmed_by');
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(AppointmentStatusLog::class);
    }

    // Only ever populated by the upcoming-appointment reminder job
    // (Notification::notifyUser's $appointmentId param) — every other
    // notification is fired directly from a controller action and has no
    // reason to link back to the appointment row.
    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }
}
