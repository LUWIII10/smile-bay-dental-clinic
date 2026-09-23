<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Appointment extends Model
{
    protected $fillable = [
        'patient_id',
        'dentist_id',
        'service_id',
        'patient_notes',
        'recommended_follow_up_service_id',
        'follow_up_recommended_by',
        'follow_up_recommended_at',
        'follow_up_fulfilled_at',
        'fulfills_appointment_id',
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
            'appointment_date' => 'date:Y-m-d',
            'verified_at' => 'datetime',
            'pediatric_confirmed_at' => 'datetime',
            'hmo_status_updated_at' => 'datetime',
            'follow_up_recommended_at' => 'datetime',
            'follow_up_fulfilled_at' => 'datetime',
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

    public function recommendedFollowUpService(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'recommended_follow_up_service_id');
    }

    public function followUpRecommendedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'follow_up_recommended_by');
    }

    // The NEW appointment that actually books the recommendation this
    // appointment carries — the inverse of fulfillsAppointment() below.
    public function fulfilledByAppointment(): HasOne
    {
        return $this->hasOne(Appointment::class, 'fulfills_appointment_id');
    }

    // On the NEW appointment: the earlier (completed) appointment whose
    // follow-up recommendation this one satisfies, if any.
    public function fulfillsAppointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'fulfills_appointment_id');
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(AppointmentStatusLog::class);
    }

    // Same three conditions StaffVerificationController::index() applies
    // inline: HMO, still pending, and — if pediatric — already cleared by
    // the pediatric dentist. Extracted here so a second consumer (the staff
    // dashboard's "Pending Verifications" count) can match that queue
    // exactly without hand-copying the filter. StaffVerificationController
    // itself is intentionally left as its own inline query, not switched to
    // this scope, so its behavior stays provably unchanged.
    public function scopeAwaitingHmoVerification(Builder $query): Builder
    {
        return $query->where('patient_type_snapshot', 'hmo')
            ->where('status', 'pending_verification')
            ->where(function (Builder $query) {
                $query->whereHas('service', fn ($q) => $q->where('is_pediatric', false))
                    ->orWhereNotNull('pediatric_confirmed_at');
            });
    }

    // Same three conditions PediatricVerificationController::index() applies
    // inline: this dentist's own bookings, still pending, not yet cleared by
    // them. Extracted here so a second consumer (the dentist dashboard's
    // pediatric-review banner) can match that queue exactly without
    // hand-copying the filter. PediatricVerificationController itself is
    // intentionally left as its own inline query, not switched to this
    // scope, so its behavior stays provably unchanged.
    public function scopeAwaitingPediatricReview(Builder $query, int $dentistId): Builder
    {
        return $query->where('dentist_id', $dentistId)
            ->where('status', 'pending_verification')
            ->whereNull('pediatric_confirmed_at');
    }

    // A follow-up recommendation this appointment carries that hasn't been
    // booked yet — used by the patient's "Book a Follow-up" entry point and
    // by FollowUpRecommendationService's own re-check before consuming one.
    public function scopeWithOpenFollowUpRecommendation(Builder $query): Builder
    {
        return $query->whereNotNull('recommended_follow_up_service_id')
            ->whereNull('follow_up_fulfilled_at');
    }

    // The other direction of TreatmentHistory::appointment(). Only ever
    // populated going forward, by AppointmentController::complete()'s new
    // procedure-record step — appointments completed before that existed
    // (and the 7 pre-existing treatment_history rows, none of which carry
    // an appointment_id) simply resolve this to null, same as any
    // appointment nobody has logged a procedure against yet.
    public function treatmentHistoryEntry(): HasOne
    {
        return $this->hasOne(TreatmentHistory::class);
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
