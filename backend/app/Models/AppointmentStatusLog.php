<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppointmentStatusLog extends Model
{
    // Migration created the table as singular "appointment_status_log", not
    // Eloquent's default pluralized guess ("appointment_status_logs").
    protected $table = 'appointment_status_log';

    // Append-only audit row — table only has created_at (see its migration),
    // no updated_at column exists.
    public $timestamps = false;

    protected $fillable = [
        'appointment_id',
        'old_status',
        'new_status',
        'changed_by',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    // See ActivityLog::booted() for why this is needed: the migration's
    // `useCurrent()` default lets the DB server's own clock stamp this
    // column, which silently breaks once the DB server's clock isn't in
    // app.timezone (as on live Hostinger, where MySQL runs in UTC).
    protected static function booted(): void
    {
        static::creating(function (self $log) {
            $log->created_at ??= now();
        });
    }

    public function appointment(): BelongsTo
    {
        return $this->belongsTo(Appointment::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
