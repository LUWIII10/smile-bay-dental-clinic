<?php

namespace App\Http\Controllers\Api\Records;

use App\Http\Controllers\Controller;
use App\Models\DentalRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The patient-facing "My Dental Records" page's backend — a read-only view
 * of the logged-in patient's own dental_records row: treatment plans/items
 * and treatment history. Deliberately excludes the tooth chart and clinical
 * notes (see the confidentiality comments in show() below) — those stay
 * staff-only (dentist/dental_assistant/admin), same as on
 * PatientRecordController, which does load them in full. Nothing here is
 * writable — this page has no editing of its own.
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
            // Same confidentiality rule as Clinical Notes below: the tooth
            // chart (including each tooth's own `notes` column) is a
            // dentist/dental_assistant/admin-only tool, never sent to the
            // patient this record belongs to. No relation call at all here
            // (not just a hidden field) — PatientRecordController (the
            // staff-facing equivalent) still loads it in full.
            //
            // Clinical Notes are a dentist/dental_assistant/admin-only
            // tool per explicit client request — confidential, never sent
            // to the patient this record belongs to. No relation call at
            // all here (not just a hidden field): PatientRecordController
            // (the staff-facing equivalent) still loads it in full.
            'treatmentPlans' => fn ($q) => $q->with([
                'dentist:id,name',
                'items' => fn ($iq) => $iq->orderBy('sequence'),
            ])->orderByDesc('created_at'),
            // Same confidentiality rule applies to a treatment history
            // entry's own `notes` column — explicitly excluded via select()
            // (dental_record_id is the FK the relation needs to resolve;
            // id is the PK) rather than trusting the frontend to just not
            // render a field it was handed anyway.
            'treatmentHistory' => fn ($q) => $q
                ->select('id', 'dental_record_id', 'appointment_id', 'treatment_plan_item_id', 'tooth_number', 'procedure_name', 'performed_by', 'performed_at')
                ->with('performedBy:id,name')
                ->orderByDesc('performed_at'),
        ]);

        return response()->json(['data' => $record]);
    }
}
