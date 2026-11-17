<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DentalRecord;
use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
    // Same shape as RegisterRequest's own rules for these exact fields —
    // a dependent gets the same clinical intake a self-registering adult
    // patient would give for themselves (medical/dental history, payment
    // & HMO coverage), just filled in by the parent instead. The
    // frontend's wizard always resends the full form on both store() and
    // update(), so every field here is unconditionally required/nullable,
    // never "sometimes".
    private function fieldRules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'date_of_birth' => [
                'required', 'date', 'before:today',
                function ($attribute, $value, $fail) {
                    if ($value && now()->parse($value)->age >= 18) {
                        $fail('A dependent must be under 18 years old. For an adult, they should register their own account.');
                    }
                },
            ],
            'sex' => ['required', 'in:male,female'],
            'relationship_to_parent' => ['required', 'in:son,daughter,ward'],

            // ---- Payment & Coverage ----
            'patient_type' => ['required', 'in:cash,hmo'],
            'hmo_provider_id' => [
                'required_if:patient_type,hmo', 'nullable', 'integer',
                Rule::exists('hmo_providers', 'id')->where('is_active', true),
            ],
            'hmo_number' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:100'],
            'hmo_company_name' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:255'],

            // ---- Medical Information ----
            'allergies' => ['nullable', 'string', 'max:1000'],
            'current_medications' => ['nullable', 'string', 'max:1000'],
            'medical_conditions_notes' => ['nullable', 'string', 'max:1000'],
            'blood_type' => ['nullable', 'string', 'max:10'],
            'medical_conditions' => ['nullable', 'array'],
            'medical_conditions.*' => ['string', 'max:100'],
            'previous_surgeries' => ['nullable', 'string', 'max:1000'],
            'last_physical_exam' => ['nullable', 'string', 'max:100'],
            'physician_name_specialty' => ['nullable', 'string', 'max:255'],

            // ---- Dental History ----
            'last_dental_visit' => ['nullable', 'string', 'max:100'],
            'last_dental_treatment' => ['nullable', 'string', 'max:255'],
            'brushing_frequency' => ['nullable', 'string', 'max:100'],
            'dental_procedures_history' => ['nullable', 'array'],
            'dental_procedures_history.*' => ['string', 'max:100'],
            'current_dental_symptoms' => ['nullable', 'array'],
            'current_dental_symptoms.*' => ['string', 'max:100'],
            'visit_reason' => ['nullable', 'string', 'max:1000'],
        ];
    }

    // Maps a validated payload onto Patient's own columns — shared by
    // store() and update() so they can never drift on this mapping.
    // Mirrors AuthController::register()'s own mapping for the same
    // fields (medical_conditions_notes -> medical_conditions_other, HMO
    // fields nulled out when patient_type is cash).
    private function attributesFromValidated(array $validated): array
    {
        $attributes = array_intersect_key($validated, array_flip([
            'first_name', 'middle_name', 'last_name', 'date_of_birth', 'sex', 'relationship_to_parent',
            'allergies', 'current_medications', 'blood_type', 'medical_conditions',
            'previous_surgeries', 'last_physical_exam', 'physician_name_specialty',
            'last_dental_visit', 'last_dental_treatment', 'brushing_frequency',
            'dental_procedures_history', 'current_dental_symptoms', 'visit_reason',
        ]));

        if (array_key_exists('medical_conditions_notes', $validated)) {
            $attributes['medical_conditions_other'] = $validated['medical_conditions_notes'];
        }

        if (array_key_exists('patient_type', $validated)) {
            $attributes['patient_type'] = $validated['patient_type'];
            $isHmo = $validated['patient_type'] === 'hmo';
            $attributes['hmo_provider_id'] = $isHmo ? $validated['hmo_provider_id'] : null;
            $attributes['hmo_number'] = $isHmo ? $validated['hmo_number'] : null;
            $attributes['hmo_company_name'] = $isHmo ? $validated['hmo_company_name'] : null;
        }

        return $attributes;
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
                ...$this->attributesFromValidated($validated),
                'user_id' => null,
                'parent_patient_id' => $patient->id,
                'is_dependent' => true,
                // The parent filling in this full intake IS the consent
                // capture — same reasoning as StaffAppointmentController::
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

        $validated = $request->validate($this->fieldRules());
        $dependent->update($this->attributesFromValidated($validated));

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
            'hmo_provider_id' => $dependent->hmo_provider_id,
            'hmo_provider_name' => $dependent->hmoProvider?->name,
            'hmo_number' => $dependent->hmo_number,
            'hmo_company_name' => $dependent->hmo_company_name,
            'allergies' => $dependent->allergies,
            'current_medications' => $dependent->current_medications,
            'medical_conditions' => $dependent->medical_conditions ?? [],
            'medical_conditions_notes' => $dependent->medical_conditions_other,
            'blood_type' => $dependent->blood_type,
            'previous_surgeries' => $dependent->previous_surgeries,
            'last_physical_exam' => $dependent->last_physical_exam,
            'physician_name_specialty' => $dependent->physician_name_specialty,
            'last_dental_visit' => $dependent->last_dental_visit,
            'last_dental_treatment' => $dependent->last_dental_treatment,
            'brushing_frequency' => $dependent->brushing_frequency,
            'dental_procedures_history' => $dependent->dental_procedures_history ?? [],
            'current_dental_symptoms' => $dependent->current_dental_symptoms ?? [],
            'visit_reason' => $dependent->visit_reason,
        ];
    }
}
