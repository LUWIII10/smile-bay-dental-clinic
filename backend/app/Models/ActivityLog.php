<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The system-wide activity trail behind the admin "Activity Log" page —
 * see the migration's own doc comment for how this differs from
 * AppointmentStatusLog. Append-only: nothing ever updates a row, same
 * $timestamps = false + useCurrent() pattern AppointmentStatusLog already
 * uses.
 */
class ActivityLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'actor_id',
        'action',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * One-line call site for every place in the app that needs to record
     * something here — mirrors Notification::notifyUser()'s own static
     * convenience-method shape, so logging an activity never needs its own
     * service class injected just to call one method. $actorId is nullable
     * for system-triggered events (see the migration's doc comment).
     */
    public static function record(?int $actorId, string $action, string $description): void
    {
        static::create([
            'actor_id' => $actorId,
            'action' => $action,
            'description' => $description,
        ]);
    }
}
