<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;

class ServiceController extends Controller
{
    /**
     * List active procedures for the booking wizard's service-selection step.
     */
    public function index()
    {
        return response()->json([
            'data' => Service::where('is_active', true)
                ->orderBy('id')
                ->get(['id', 'name', 'description', 'category', 'duration_minutes']),
        ]);
    }
}
