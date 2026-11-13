<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HmoProvider extends Model
{
    protected $fillable = [
        'name',
        'logo_path',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    // Used by ClinicSettingsController::show()/destroyHmoProvider() to let
    // Settings.jsx know up front whether "Remove" is safe to enable for a
    // given provider, without a round trip per row.
    public function patients()
    {
        return $this->hasMany(Patient::class);
    }
}
