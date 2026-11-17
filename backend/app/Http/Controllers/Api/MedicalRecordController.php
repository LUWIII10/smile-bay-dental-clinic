<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use Illuminate\Http\Request;

/**
 * Patient-facing — the booking wizard's own Medical Record step (prefill
 * from the last visit) and the "My Dental Records" page's own history
 * section. Staff-facing equivalents live on PatientRecordController
 * instead, since that page already loads the rest of a patient's record.
 *
 * Both methods accept an optional ?dependent_id= — booking for, or
 * viewing the dental records of, one of the logged-in patient's own
 * dependents (ownership-checked via Patient::dependents(), never a raw
 * id lookup) reads/prefills THAT dependent's own history, not the
 * parent's.
 */
class MedicalRecordController extends Controller
{
    // Resolves which patients row this request's medical-record data
    // should actually come from — the logged-in patient's own row, or
    // (if ?dependent_id= names one of their own dependents) that
    // dependent's row instead. Returns null if dependent_id was given but
    // doesn't belong to this account, so the caller can fail closed
    // rather than silently falling back to the parent's own records.
    private function resolveSubject(Request $request, Patient $patient): ?Patient
    {
        $dependentId = $request->integer('dependent_id') ?: null;
        if (! $dependentId) {
            return $patient;
        }

        return $patient->dependents()->find($dependentId);
    }

    public function latest(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['data' => null]);
        }

        $subject = $this->resolveSubject($request, $patient);
        if (! $subject) {
            return response()->json(['message' => 'This dependent does not belong to your account.'], 403);
        }

        return response()->json(['data' => $subject->latestMedicalRecord]);
    }

    public function history(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['data' => []]);
        }

        $subject = $this->resolveSubject($request, $patient);
        if (! $subject) {
            return response()->json(['message' => 'This dependent does not belong to your account.'], 403);
        }

        $records = $subject->medicalRecords()
            ->with('appointment.service:id,name')
            ->get();

        return response()->json(['data' => $records]);
    }
}
