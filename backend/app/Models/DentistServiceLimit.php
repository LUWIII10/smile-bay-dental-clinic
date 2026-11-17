<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class DentistServiceLimit extends Model
{
    protected $fillable = [
        'dentist_id',
        'date',
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

    // The services still allowed on this date — everything else this
    // dentist is credentialed for (see User::services()) stops being
    // offered for this one date only.
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'dentist_service_limit_service');
    }
}
