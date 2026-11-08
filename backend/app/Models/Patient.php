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
        'booking_restricted_at',
        'restriction_count',
        'cancellation_count_reset_at',
        'hmo_coverage_notes',
        'hmo_coverage_verified_at',
        'archived_at',
        'archived_by',
        'archive_reason',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date:Y-m-d',
            'medical_conditions' => 'array',
            'dental_procedures_history' => 'array',
            'current_dental_symptoms' => 'array',
            'consent_certified' => 'boolean',
            'booking_restricted_at' => 'datetime',
            'hmo_coverage_verified_at' => 'datetime',
            'archived_at' => 'datetime',
            'cancellation_count_reset_at' => 'datetime',
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

    // See the 2026_09_21_000400 migration's own doc comment — a lighter,
    // earlier stage than users.status: blocks new self-service bookings
    // only, login and everything else keeps working normally.
    public function isBookingRestricted(): bool
    {
        return $this->booking_restricted_at !== null;
    }

    // Two independent anti-abuse guardrails on top of isBookingRestricted()'s
    // 3-strike cancellation policy — both self-service-booking-only, same
    // staff-exempt carve-out (StaffAppointmentController::assignWalkIn()
    // deliberately never calls either of these).
    //
    // DAILY_BOOKING_LIMIT: how many times a patient may successfully book a
    // NEW appointment within one calendar day (Asia/Manila, matching
    // app.timezone) — counts every appointment created today regardless of
    // which future date it's FOR, and regardless of its current status
    // (even one cancelled minutes later already used one of today's 3, or
    // "attempts" would mean nothing). Resets automatically at midnight —
    // this is purely a count of today's created_at rows, nothing persisted.
    // Anti-spam: stops someone from hammering the booking form in one
    // sitting. On its own this wouldn't stop a patient from re-maxing out
    // every single day, which is exactly what MAX_UPCOMING_APPOINTMENTS
    // below is for.
    public const DAILY_BOOKING_LIMIT = 3;

    // MAX_UPCOMING_APPOINTMENTS: how many appointments a patient may have
    // concurrently active (status confirmed or pending_verification, dated
    // today or later) at any one time — regardless of which day each one was
    // booked on. Doesn't reset on a timer; only goes down when one of those
    // appointments is completed or cancelled, freeing up a slot. This is the
    // one that actually closes the long-term loophole DAILY_BOOKING_LIMIT
    // alone leaves open (booking 3 more every day, forever) — it's also the
    // more commonly used real-world pattern (Jane's "upcoming appointments
    // limit", TimeTap's "max open appointments", Cegedim's "Maximum
    // Outstanding Appointments").
    public const MAX_UPCOMING_APPOINTMENTS = 3;

    public function reachedDailyBookingLimit(): bool
    {
        return $this->appointments()
            ->whereDate('created_at', now()->toDateString())
            ->count() >= self::DAILY_BOOKING_LIMIT;
    }

    public function reachedUpcomingAppointmentLimit(): bool
    {
        return $this->appointments()
            ->whereIn('status', ['confirmed', 'pending_verification'])
            ->where('appointment_date', '>=', now()->toDateString())
            ->count() >= self::MAX_UPCOMING_APPOINTMENTS;
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    // Orthogonal to isBookingRestricted() and the account's own
    // users.status — see the 2026_09_30_140000 migration's doc comment.
    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
