<?php

namespace App\Http\Controllers\Api\Records;

use App\Http\Controllers\Controller;
use App\Models\DentalRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The patient-facing "My Dental Records" page's backend — a read-only view
 * of the logged-in patient's own dental_records row: tooth chart, clinical
 * notes, treatment plans/items, and treatment history. Nothing here is
 * writable yet — dentist-side charting/notes tooling doesn't exist in the
 * app yet either (Patient Records is still a ComingSoon stub on that side),
 * so most patients will see a freshly-provisioned, mostly-empty record.
 */
class PatientDentalRecordController extends Controller
{
    public function show(Request $request)
    {
        $patient = $request->user()->patient;

        if (! $patient) {
            return response()->json(['message' => 'No patient profile found for this account.'], 404);
        }

        $record = $patient->dentalRecord;

        // Lazily provisioned on first view — dental_records isn't created at
        // registration (nothing to put in it yet), so this is the first
        // point a record can exist. record_number is NOT NULL + unique with
        // no default, and the id it's derived from only exists once the row
        // itself is inserted — so the insert uses a temporary placeholder
        // that's unique on its own (patient_id can only ever provision one
        // dental_records row, per the migration's own unique constraint on
        // that column) and is immediately overwritten with the real
        // formatted number, same two-step shape as
        // Patient::formatPatientNumber()'s call site.
        if (! $record) {
            $record = DB::transaction(function () use ($patient) {
                $record = DentalRecord::create([
                    'patient_id' => $patient->id,
                    'opened_at' => now(),
                    'record_number' => 'PENDING-'.$patient->id,
                ]);
                $record->update(['record_number' => DentalRecord::formatRecordNumber($record->id, $record->opened_at)]);

                return $record;
            });
        }

        $record->load([
            'patient:id,patient_number',
            'primaryDentist:id,name',
            'toothConditions' => fn ($q) => $q->orderBy('tooth_number'),
            'toothConditions.updatedBy:id,name',
            'clinicalNotes' => fn ($q) => $q->with('dentist:id,name')->orderByDesc('created_at'),
            'treatmentPlans' => fn ($q) => $q->with([
                'dentist:id,name',
                'items' => fn ($iq) => $iq->orderBy('sequence'),
            ])->orderByDesc('created_at'),
            'treatmentHistory' => fn ($q) => $q->with('performedBy:id,name')->orderByDesc('performed_at'),
        ]);

        return response()->json(['data' => $record]);
    }
}
