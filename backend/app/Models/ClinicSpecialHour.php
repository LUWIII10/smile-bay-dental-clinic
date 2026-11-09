<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A one-off date the clinic opens outside its normal weekly Operating
// Hours — see the migration's own doc comment. Raw time strings (no cast),
// same convention as ClinicSchedule — the frontend already slices
// "HH:mm:ss" down to "HH:mm" itself for that one, kept consistent here.
class ClinicSpecialHour extends Model
{
    protected $fillable = [
        'date',
        'open_time',
        'close_time',
        'reason',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
        ];
    }
}
