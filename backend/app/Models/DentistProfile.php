<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DentistProfile extends Model
{
    protected $fillable = [
        'user_id',
        'specialization',
        'license_number',
        'bio',
        'photo_path',
        'years_experience',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
