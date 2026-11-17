<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Patient-facing — the booking wizard's own Medical Record step (prefill
 * from the last visit) and the "My Dental Records" page's own history
 * section. Staff-facing equivalents live on PatientRecordController
 * instead, since that page already loads the rest of a patient's record.
 */
class MedicalRecordController extends Controller
{
    public function latest(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['data' => null]);
        }

        return response()->json(['data' => $patient->latestMedicalRecord]);
    }

    public function history(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['data' => []]);
        }

        $records = $patient->medicalRecords()
            ->with('appointment.service:id,name')
            ->get();

        return response()->json(['data' => $records]);
    }
}
