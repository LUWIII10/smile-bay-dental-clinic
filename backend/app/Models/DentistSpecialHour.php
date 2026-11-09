<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// One dentist's own opt-in to a date Settings > Special Opening Dates has
// already opened clinic-wide — see the migration's own doc comment.
class DentistSpecialHour extends Model
{
    protected $fillable = [
        'dentist_id',
        'date',
        'start_time',
        'end_time',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
        ];
    }

    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }
}
