<?php

namespace App\Http\Controllers\Api\Records;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\ClinicalNote;
use App\Models\DentalRecord;
use App\Models\Patient;
use App\Models\ToothCondition;
use App\Models\TreatmentHistory;
use App\Models\TreatmentPlan;
use App\Models\TreatmentPlanItem;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Staff-facing "Patient Records" — dentist/dental_assistant/admin's view of
 * every patient's profile + dental record. Read access (index/show) is
 * shared across all three roles via routes/api.php; every write action here
 * (notes, tooth conditions, treatment plans/items, treatment history) is
 * dentist-only, enforced by that same file's role:dentist group — matching
 * the migrations' own doc comments ("authored/edited by dentists only").
 */
class PatientRecordController extends Controller
{
    /**
     * Searchable, paginated patient directory. Deliberately separate from
     * StaffAppointmentController::searchPatients() (a lightweight
     * autocomplete for the walk-in modal, capped at 10 results, no
     * pagination) — this is the full directory this page's table needs.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Patient::query()->with('user:id,email,mobile_number');

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('patient_number', 'like', "%{$search}%")
                    ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$search}%"])
                    ->orWhereHas('user', fn ($uq) => $uq->where('email', 'like', "%{$search}%"));
            });
        }

        $perPage = $validated['per_page'] ?? 10;

        return response()->json($query->orderBy('last_name')->paginate($perPage)->withQueryString());
    }

    /**
     * Every appointment scheduled on one specific date, across all
     * patients — the "who's actually on the books for this day" list an
     * admin/staff wants to print rather than the full patient directory
     * above. Deliberately appointment-centric, not patient-centric (a
     * patient with two visits the same day shows up as two rows, each
     * with its own real time/service/dentist) — unpaginated, since a
     * single day's schedule is small enough to always fit on one printed
     * page. Cancelled/rejected are excluded: a report of who "had an
     * appointment" that day shouldn't include ones that didn't happen.
     */
    public function appointmentsByDate(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date'],
        ]);

        $appointments = Appointment::whereDate('appointment_date', $validated['date'])
            ->whereIn('status', ['confirmed', 'pending_verification', 'completed'])
            ->with([
                'patient:id,patient_number,first_name,last_name',
                'service:id,name',
                'dentist:id,name',
            ])
            ->orderBy('appointment_time')
            ->get();

        return response()->json(['data' => $appointments]);
    }

    /**
     * Same list as appointmentsByDate() above, as a real PDF — the
     * "Download PDF" button next to this report's existing browser-print
     * "Print" button on the Patient Records page.
     */
    public function appointmentsByDatePdf(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date'],
        ]);

        $appointments = Appointment::whereDate('appointment_date', $validated['date'])
            ->whereIn('status', ['confirmed', 'pending_verification', 'completed'])
            ->with([
                'patient:id,patient_number,first_name,last_name',
                'service:id,name',
                'dentist:id,name',
            ])
            ->orderBy('appointment_time')
            ->get();

        $pdf = Pdf::loadView('pdf.patient-appointments-report', [
            'date' => $validated['date'],
            'appointments' => $appointments,
            'generatedAt' => now(),
        ]);

        return $pdf->download("patient-appointments-{$validated['date']}.pdf");
    }

    /**
     * Full profile + dental record for one patient — same eager-load shape
     * as PatientDentalRecordController::show(), just viewed by staff instead
     * of the patient themselves. Lazily provisions the dental record too
     * (same two-step create-then-format-number as that controller), so a
     * dentist opening a brand-new patient's file always has a record to
     * write into immediately rather than hitting a 404.
     */
    public function show(Patient $patient)
    {
        $patient->load('user', 'hmoProvider:id,name');

        $record = $patient->dentalRecord;

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

        return response()->json(['data' => ['patient' => $patient, 'dental_record' => $record]]);
    }

    /**
     * The full formal report show() above backs on-screen, as a real PDF —
     * same eager-load shape, same lazy dental-record provisioning (in
     * practice always a no-op here: by the time this button is clickable
     * the page has already called show() once, which already provisioned
     * it). date_from/date_to scope Treatment History and Clinical Notes
     * only, matching PatientRecords.jsx's own printRange — everything else
     * (patient info, dental chart, treatment plans) is always shown in full.
     */
    public function showPdf(Request $request, Patient $patient)
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $dateFrom = $validated['date_from'] ?? now()->subMonths(6)->toDateString();
        $dateTo = $validated['date_to'] ?? now()->toDateString();

        $patient->load('user', 'hmoProvider:id,name');

        $record = $patient->dentalRecord;

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

        $printHistory = $record->treatmentHistory
            ->filter(fn ($h) => $h->performed_at->toDateString() >= $dateFrom && $h->performed_at->toDateString() <= $dateTo)
            ->values();
        $printNotes = $record->clinicalNotes
            ->filter(fn ($n) => $n->created_at->toDateString() >= $dateFrom && $n->created_at->toDateString() <= $dateTo)
            ->values();

        $pdf = Pdf::loadView('pdf.patient-dental-record', [
            'patient' => $patient,
            'record' => $record,
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'printHistory' => $printHistory,
            'printNotes' => $printNotes,
            'generatedAt' => now(),
        ]);

        return $pdf->download("dental-record-{$patient->patient_number}.pdf");
    }

    /**
     * Add a clinical note. Optionally tied to an appointment (e.g. writing
     * up notes right after a visit).
     */
    public function storeClinicalNote(Request $request, Patient $patient)
    {
        $validated = $request->validate([
            'note' => ['required', 'string', 'max:5000'],
            'appointment_id' => ['nullable', 'integer', 'exists:appointments,id'],
        ]);

        $record = $patient->dentalRecord;
        abort_if(! $record, 404, 'This patient has no dental record yet.');

        $note = ClinicalNote::create([
            'dental_record_id' => $record->id,
            'dentist_id' => $request->user()->id,
            'appointment_id' => $validated['appointment_id'] ?? null,
            'note' => $validated['note'],
        ]);

        return response()->json(['data' => $note->load('dentist:id,name')], 201);
    }

    /**
     * Set (or update) a single tooth's condition — upsert on the
     * (dental_record_id, tooth_number) unique constraint, so re-editing an
     * already-charted tooth updates the same row instead of erroring or
     * duplicating.
     */
    public function updateToothCondition(Request $request, Patient $patient, int $toothNumber)
    {
        abort_unless($toothNumber >= 1 && $toothNumber <= 32, 422, 'Tooth number must be between 1 and 32.');

        $validated = $request->validate([
            'condition' => ['required', 'in:healthy,decayed,filled,missing,crowned,root_canal,extracted,impacted,other'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $record = $patient->dentalRecord;
        abort_if(! $record, 404, 'This patient has no dental record yet.');

        $tooth = ToothCondition::updateOrCreate(
            ['dental_record_id' => $record->id, 'tooth_number' => $toothNumber],
            [
                'condition' => $validated['condition'],
                'notes' => $validated['notes'] ?? null,
                'updated_by' => $request->user()->id,
            ]
        );

        return response()->json(['data' => $tooth->load('updatedBy:id,name')]);
    }

    /**
     * Create a treatment plan, optionally with its items in the same call —
     * lets the dentist lay out the whole plan in one submission instead of a
     * create-then-add-items round trip.
     */
    public function storeTreatmentPlan(Request $request, Patient $patient)
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'target_date' => ['nullable', 'date'],
            'items' => ['nullable', 'array'],
            'items.*.procedure_name' => ['required_with:items', 'string', 'max:255'],
            'items.*.tooth_number' => ['nullable', 'integer', 'between:1,32'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $record = $patient->dentalRecord;
        abort_if(! $record, 404, 'This patient has no dental record yet.');

        $plan = DB::transaction(function () use ($validated, $record, $request) {
            $plan = TreatmentPlan::create([
                'dental_record_id' => $record->id,
                'dentist_id' => $request->user()->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'status' => 'planned',
                'target_date' => $validated['target_date'] ?? null,
            ]);

            foreach ($validated['items'] ?? [] as $i => $item) {
                TreatmentPlanItem::create([
                    'treatment_plan_id' => $plan->id,
                    'tooth_number' => $item['tooth_number'] ?? null,
                    'procedure_name' => $item['procedure_name'],
                    'status' => 'pending',
                    'sequence' => $i + 1,
                    'notes' => $item['notes'] ?? null,
                ]);
            }

            return $plan;
        });

        return response()->json(['data' => $plan->load(['dentist:id,name', 'items'])], 201);
    }

    /**
     * Update a treatment plan's own status — separate from an item's status
     * below. A plan can move to in_progress/completed/cancelled independent
     * of every individual item also being explicitly toggled.
     */
    public function updateTreatmentPlanStatus(Request $request, TreatmentPlan $treatmentPlan)
    {
        if ($treatmentPlan->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This treatment plan was not created by you.'], 403);
        }

        $validated = $request->validate([
            'status' => ['required', 'in:planned,in_progress,completed,cancelled'],
        ]);

        $treatmentPlan->update(['status' => $validated['status']]);

        return response()->json(['data' => $treatmentPlan]);
    }

    /**
     * Toggle a single treatment-plan item's status. Marking an item
     * "completed" also logs it into treatment_history in the same
     * transaction — the ledger of what was actually done shouldn't require
     * separately re-entering the same procedure a second time.
     */
    public function updateTreatmentPlanItem(Request $request, TreatmentPlanItem $treatmentPlanItem)
    {
        if ($treatmentPlanItem->treatmentPlan->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'This treatment plan was not created by you.'], 403);
        }

        $validated = $request->validate([
            'status' => ['required', 'in:pending,completed,cancelled'],
        ]);

        DB::transaction(function () use ($treatmentPlanItem, $validated, $request) {
            $wasCompleted = $treatmentPlanItem->status === 'completed';
            $treatmentPlanItem->update(['status' => $validated['status']]);

            if ($validated['status'] === 'completed' && ! $wasCompleted) {
                $plan = $treatmentPlanItem->treatmentPlan;

                TreatmentHistory::create([
                    'dental_record_id' => $plan->dental_record_id,
                    'treatment_plan_item_id' => $treatmentPlanItem->id,
                    'tooth_number' => $treatmentPlanItem->tooth_number,
                    'procedure_name' => $treatmentPlanItem->procedure_name,
                    'performed_by' => $request->user()->id,
                    'performed_at' => now(),
                    'notes' => $treatmentPlanItem->notes,
                ]);
            }
        });

        return response()->json(['data' => $treatmentPlanItem->fresh()]);
    }

    /**
     * Log a completed procedure directly, independent of any treatment plan
     * item — e.g. a walk-in extraction that was never planned ahead of time.
     */
    public function storeTreatmentHistory(Request $request, Patient $patient)
    {
        $validated = $request->validate([
            'procedure_name' => ['required', 'string', 'max:255'],
            'tooth_number' => ['nullable', 'integer', 'between:1,32'],
            'performed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $record = $patient->dentalRecord;
        abort_if(! $record, 404, 'This patient has no dental record yet.');

        $entry = TreatmentHistory::create([
            'dental_record_id' => $record->id,
            'tooth_number' => $validated['tooth_number'] ?? null,
            'procedure_name' => $validated['procedure_name'],
            'performed_by' => $request->user()->id,
            'performed_at' => $validated['performed_at'] ?? now(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json(['data' => $entry->load('performedBy:id,name')], 201);
    }

    /**
     * Assign/change the patient's primary dentist.
     */
    public function updatePrimaryDentist(Request $request, Patient $patient)
    {
        $validated = $request->validate([
            // Must actually be a dentist — a plain exists:users,id would
            // also accept a patient/staff/admin id.
            'dentist_id' => [
                'required', 'integer',
                Rule::exists('users', 'id')->where('role', 'dentist'),
            ],
        ]);

        $record = $patient->dentalRecord;
        abort_if(! $record, 404, 'This patient has no dental record yet.');

        $record->update(['primary_dentist_id' => $validated['dentist_id']]);

        return response()->json(['data' => $record->load('primaryDentist:id,name')]);
    }
}
