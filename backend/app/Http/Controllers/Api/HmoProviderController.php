<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HmoProvider;

class HmoProviderController extends Controller
{
    /**
     * List active HMO providers for the registration wizard's HMO dropdown.
     * Public endpoint — needed before the patient has an account.
     */
    public function index()
    {
        return response()->json([
            'data' => HmoProvider::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }
}
