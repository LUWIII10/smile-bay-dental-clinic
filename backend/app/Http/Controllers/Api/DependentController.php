<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DentalRecord;
use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * "My Dependents" — a parent patient managing their minor children's
 * profiles. A dependent is just another `patients` row with no login of
 * its own (user_id null, is_dependent true, parent_patient_id pointing
 * back here) — see the 2026_11_17_000100 migration's own doc comment for
 * why that reuses the entire existing appointment/medical-record/dental-
 * record system for free instead of a parallel structure. Deliberately
 * NOT reachable from the booking wizard (StoreAppointmentRequest only
 * accepts an already-existing dependent_id) — adding one is only ever
 * done here or from My Profile.
 */
class DependentController extends Controller
{
    private function fieldRules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'first_name' => [$req, 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => [$req, 'string', 'max:100'],
            'date_of_birth' => [
                $req, 'date', 'before:today',
                function ($attribute, $value, $fail) {
                    if ($value && now()->parse($value)->age >= 18) {
                        $fail('A dependent must be under 18 years old. For an adult, they should register their own account.');
                    }
                },
            ],
            'sex' => [$req, 'in:male,female'],
            'relationship_to_parent' => [$req, 'in:son,daughter,ward'],
        ];
    }

    public function index(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['data' => []]);
        }

        $dependents = $patient->dependents()->get()->map(fn (Patient $d) => $this->present($d));

        return response()->json(['data' => $dependents]);
    }

    public function store(Request $request)
    {
        $patient = $request->user()->patient;
        if (! $patient) {
            return response()->json(['message' => 'No patient profile is linked to this account.'], 422);
        }

        $validated = $request->validate($this->fieldRules());

        $dependent = DB::transaction(function () use ($validated, $patient) {
            $dependent = Patient::create([
                'user_id' => null,
                'parent_patient_id' => $patient->id,
                'is_dependent' => true,
                'relationship_to_parent' => $validated['relationship_to_parent'],
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'] ?? null,
                'last_name' => $validated['last_name'],
                'date_of_birth' => $validated['date_of_birth'],
                'sex' => $validated['sex'],
                // Inherited from the parent — a household's children are
                // overwhelmingly on the same coverage; staff/parent can
                // still change it per dependent later the same way they
                // can for any patient.
                'patient_type' => $patient->patient_type,
                'hmo_provider_id' => $patient->hmo_provider_id,
                'hmo_number' => $patient->hmo_number,
                'hmo_company_name' => $patient->hmo_company_name,
                // The parent adding this profile IS the consent capture —
                // same reasoning as StaffAppointmentController::
                // registerWalkInPatient()'s in-person equivalent.
                'consent_certified' => true,
            ]);
            $dependent->update(['patient_number' => Patient::formatPatientNumber($dependent->id, $dependent->created_at)]);

            return $dependent;
        });

        return response()->json(['data' => $this->present($dependent)], 201);
    }

    public function update(Request $request, Patient $dependent)
    {
        $this->authorizeOwnership($request, $dependent);

        $validated = $request->validate($this->fieldRules(partial: true));
        $dependent->update($validated);

        return response()->json(['data' => $this->present($dependent->fresh())]);
    }

    public function destroy(Request $request, Patient $dependent)
    {
        $this->authorizeOwnership($request, $dependent);

        if ($dependent->appointments()->exists()) {
            return response()->json([
                'message' => 'This dependent has appointment history on file and can\'t be removed. Contact the clinic if this profile needs to be merged or corrected.',
            ], 422);
        }

        DB::transaction(function () use ($dependent) {
            $dependent->dentalRecord?->delete();
            $dependent->delete();
        });

        return response()->json(['message' => 'Dependent removed.']);
    }

    /**
     * The dependent's own "My Dental Records" equivalent — same shape
     * PatientDentalRecordController::show() returns for the parent's own
     * record, just scoped to this dependent's row instead.
     */
    public function dentalRecord(Request $request, Patient $dependent)
    {
        $this->authorizeOwnership($request, $dependent);

        $record = $dependent->dentalRecord;
        if (! $record) {
            $record = DB::transaction(function () use ($dependent) {
                $record = DentalRecord::create([
                    'patient_id' => $dependent->id,
                    'opened_at' => now(),
                    'record_number' => 'PENDING-'.$dependent->id,
                ]);
                $record->update(['record_number' => DentalRecord::formatRecordNumber($record->id, $record->opened_at)]);

                return $record;
            });
        }

        $record->load([
            'patient:id,patient_number',
            'primaryDentist:id,name',
            'treatmentPlans' => fn ($q) => $q->with([
                'dentist:id,name',
                'items' => fn ($iq) => $iq->orderBy('sequence'),
            ])->orderByDesc('created_at'),
            'treatmentHistory' => fn ($q) => $q
                ->select('id', 'dental_record_id', 'appointment_id', 'treatment_plan_item_id', 'tooth_number', 'procedure_name', 'performed_by', 'performed_at')
                ->with('performedBy:id,name')
                ->orderByDesc('performed_at'),
        ]);

        return response()->json(['data' => $record]);
    }

    private function authorizeOwnership(Request $request, Patient $dependent): void
    {
        $patient = $request->user()->patient;
        if (! $patient || ! $dependent->is_dependent || $dependent->parent_patient_id !== $patient->id) {
            abort(403, 'This dependent does not belong to your account.');
        }
    }

    private function present(Patient $dependent): array
    {
        return [
            'id' => $dependent->id,
            'first_name' => $dependent->first_name,
            'middle_name' => $dependent->middle_name,
            'last_name' => $dependent->last_name,
            'full_name' => trim("{$dependent->first_name} {$dependent->last_name}"),
            'date_of_birth' => $dependent->date_of_birth?->toDateString(),
            'age' => $dependent->age(),
            'sex' => $dependent->sex,
            'relationship_to_parent' => $dependent->relationship_to_parent,
            'patient_type' => $dependent->patient_type,
        ];
    }
}
