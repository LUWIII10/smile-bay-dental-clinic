<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Single-row settings table (no foreign keys, nothing scopes it to a
// particular "owner") — ClinicSettingsController always reads/writes the
// first (and only) row, creating it on first access if it's ever missing.
class ClinicInfo extends Model
{
    // Eloquent would otherwise guess "clinic_infos" (pluralizing "info" the
    // naive way, appending "s") — the migration created "clinic_info".
    protected $table = 'clinic_info';

    protected $fillable = [
        'clinic_name',
        'tagline',
        'address',
        'contact_number',
        'contact_email',
    ];
}
