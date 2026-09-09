<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    protected $fillable = ['user_id', 'appointment_id', 'title', 'body', 'url', 'read_at'];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    // One row per recipient — every call site below is a real event
    // (booking confirmed/rejected/rescheduled, HMO/pediatric review
    // needed), never a synthetic placeholder, so there's no bulk-insert
    // helper here beyond looping this per user. $appointmentId is only
    // ever passed by the upcoming-appointment reminder job — it's how that
    // job later checks "have I already reminded about this one?" without
    // string-matching titles.
    public static function notifyUser(
        int $userId,
        string $title,
        ?string $body = null,
        ?string $url = null,
        ?int $appointmentId = null
    ): self {
        return static::create([
            'user_id' => $userId,
            'appointment_id' => $appointmentId,
            'title' => $title,
            'body' => $body,
            'url' => $url,
        ]);
    }

    public static function notifyRoles(array $roles, string $title, ?string $body = null, ?string $url = null): void
    {
        User::whereIn('role', $roles)->pluck('id')->each(
            fn (int $userId) => static::notifyUser($userId, $title, $body, $url)
        );
    }

    // Same role broadcast as notifyRoles(), but tied to one appointment and
    // safe to call repeatedly for it — skips entirely if any notification
    // already references this appointment_id. Every "HMO verification
    // needed" call site is a candidate for double-firing (a walk-in booked
    // through a path that predates this check, a future code path that
    // creates the same kind of appointment, a backfill command re-run) —
    // this is the one guard all of them share instead of each call site
    // inventing its own duplicate-check.
    public static function notifyRolesOnce(array $roles, int $appointmentId, string $title, ?string $body = null): void
    {
        if (static::where('appointment_id', $appointmentId)->exists()) {
            return;
        }

        User::whereIn('role', $roles)->pluck('id')->each(
            fn (int $userId) => static::notifyUser($userId, $title, $body, null, $appointmentId)
        );
    }
}
