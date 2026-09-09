<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DentistDayOff extends Model
{
    // Table is singular ("day_off") per the approved spec, not Eloquent's
    // default pluralization guess ("dentist_day_offs").
    protected $table = 'dentist_day_off';

    protected $fillable = [
        'dentist_id',
        'date',
        'reason',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
        ];
    }

    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }
}
