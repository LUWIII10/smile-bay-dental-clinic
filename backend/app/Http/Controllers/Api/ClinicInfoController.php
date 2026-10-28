<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClinicInfo;

/**
 * Public — the landing page's Contact section and footer, reachable
 * before login. Read-only mirror of Admin\ClinicSettingsController's own
 * clinic_info slice (same HmoProviderController precedent: a public,
 * read-only sibling of a staff-only admin endpoint, not a new source of
 * truth).
 */
class ClinicInfoController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => ClinicInfo::firstOrCreate([], ['clinic_name' => 'Smile Bay Dental Clinic']),
        ]);
    }
}
