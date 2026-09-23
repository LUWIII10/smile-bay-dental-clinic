<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * List active procedures. Staff callers (walk-in booking, the
     * appointments filter) get the full catalog as before. The patient
     * booking wizard passes ?patient_bookable=1 to narrow this down to the
     * short list of common, self-service-appropriate entries flagged via
     * services.is_patient_bookable — everything else (surgical procedures,
     * implants, etc.) stays staff-only.
     */
    public function index(Request $request)
    {
        $query = Service::where('is_active', true);

        if ($request->boolean('patient_bookable')) {
            $query->where('is_patient_bookable', true);
        }

        return response()->json([
            'data' => $query->orderBy('id')
                ->get(['id', 'name', 'description', 'category', 'duration_minutes']),
        ]);
    }
}
