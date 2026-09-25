<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\AppointmentConfirmedMail;
use App\Mail\AppointmentRejectedMail;
use App\Mail\HmoBookingSubmittedMail;
use App\Mail\PediatricBookingSubmittedMail;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Notification;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentSlotService;
use App\Services\FollowUpRecommendationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The "All Appointments" master view (admin + dental_assistant) — a
 * clinic-wide, unscoped read of every appointment regardless of dentist or
 * patient, plus staff's own walk-in booking action. Deliberately separate
 * from StaffVerificationController (that one is the narrow HMO-queue read/
 * verify surface) and from AppointmentController (patient-initiated
 * booking only) — this is the "staff can see and do everything" surface.
 */
class StaffAppointmentController extends Controller
{
    public function __construct(
        private AppointmentSlotService $slots,
        private FollowUpRecommendationService $followUps,
    ) {}

    /**
     * Full appointment listing with optional filters, a single free-text
     * search across patient name, appointment id ("reference number" — this
     * schema has no dedicated reference-number column, the id stands in for
     * it), and HMO card number, a date-column sort toggle, and standard
     * Laravel pagination (this was the one list endpoint in the app still
     * returning everything unpaginated — fine at demo data volume, not fine
     * once a real clinic's appointment history grows).
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string'],
            'dentist_id' => ['nullable', 'integer'],
            'payment_type' => ['nullable', 'in:cash,hmo'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'in:date_asc,date_desc'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            // Confirmed/pending, but the date already passed and nobody
            // ever completed or no-showed it — the same "Awaiting Update"
            // concept PatientAppointments.jsx already shows the patient,
            // surfaced here so staff has one filter to find every such
            // appointment clinic-wide instead of combining status+date_to
            // by hand for each status separately.
            'overdue' => ['nullable', 'boolean'],
        ]);

        $query = Appointment::query()->with([
            'patient:id,user_id,patient_number,first_name,last_name,hmo_number',
            'patient.user:id,email,mobile_number',
            'dentist:id,name',
            'dentist.dentistProfile:id,user_id,photo_path',
            'service:id,name,duration_minutes',
        ]);

        if (! empty($validated['status']) && $validated['status'] !== 'all') {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['dentist_id'])) {
            $query->where('dentist_id', $validated['dentist_id']);
        }

        if (! empty($validated['payment_type'])) {
            $query->where('patient_type_snapshot', $validated['payment_type']);
        }

        if (! empty($validated['date_from'])) {
            $query->whereDate('appointment_date', '>=', $validated['date_from']);
        }

        if (! empty($validated['date_to'])) {
            $query->whereDate('appointment_date', '<=', $validated['date_to']);
        }

        if ($request->boolean('overdue')) {
            $query->whereIn('status', ['confirmed', 'pending_verification'])
                ->whereDate('appointment_date', '<', now()->toDateString());
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('id', 'like', "%{$search}%")
                    ->orWhereHas('patient', function ($pq) use ($search) {
                        $pq->where('hmo_number', 'like', "%{$search}%")
                            ->orWhere('patient_number', 'like', "%{$search}%")
                            ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$search}%"]);
                    })
                    // The toolbar's placeholder ("Search patient, dentist, or REF #…")
                    // promised this but the query never actually matched on it.
                    ->orWhereHas('dentist', function ($dq) use ($search) {
                        $dq->where('name', 'like', "%{$search}%");
                    });
            });
        }

        $direction = ($validated['sort'] ?? 'date_desc') === 'date_asc' ? 'asc' : 'desc';
        $query->orderBy('appointment_date', $direction)->orderBy('appointment_time', $direction);

        $perPage = $validated['per_page'] ?? 10;
        $appointments = $query->paginate($perPage)->withQueryString();

        return response()->json($appointments);
    }

    /**
     * Stat-card totals for the page header — Total / Confirmed / Pending /
     * Cancelled, all scoped to the current calendar month (not all-time),
     * with each non-total figure expressed as a percentage of that same
     * month's total so the numbers stay internally consistent. "Pending"
     * here is every pending_verification row regardless of payment type or
     * pediatric stage — see DashboardController::staffSummary()'s own note
     * on why a single status count already equals the pediatric-queue +
     * HMO-queue combined total. "Cancelled" counts only the literal
     * 'cancelled' status, not 'rejected' — they render the same red pill in
     * the table but are a different status value and a different stat card
     * in the reference design.
     */
    public function stats()
    {
        $monthStart = now()->startOfMonth()->toDateString();
        $monthEnd = now()->endOfMonth()->toDateString();

        $scoped = fn () => Appointment::whereBetween('appointment_date', [$monthStart, $monthEnd]);

        $total = $scoped()->count();
        $confirmed = $scoped()->where('status', 'confirmed')->count();
        $pending = $scoped()->where('status', 'pending_verification')->count();
        $cancelled = $scoped()->where('status', 'cancelled')->count();

        $pct = fn (int $n) => $total > 0 ? (int) round($n / $total * 100) : 0;

        return response()->json(['data' => [
            'total' => $total,
            'confirmed' => $confirmed,
            'confirmedPct' => $pct($confirmed),
            'pending' => $pending,
            'pendingPct' => $pct($pending),
            'cancelled' => $cancelled,
            'cancelledPct' => $pct($cancelled),
        ]]);
    }

    /**
     * Single appointment's full detail, including its complete status-change
     * audit trail — backs the row-level "view details" action. Read-only;
     * every state-changing action (verify, cancel, walk-in) stays on its own
     * dedicated endpoint rather than being folded into this one.
     */
    public function show(Appointment $appointment)
    {
        $appointment->load([
            'patient.user',
            'patient.hmoProvider:id,name',
            'dentist:id,name,email',
            'dentist.dentistProfile:id,user_id,photo_path',
            'service',
            'verifiedBy:id,name',
            'pediatricConfirmedBy:id,name',
            'recommendedFollowUpService:id,name,duration_minutes',
            'followUpRecommendedBy:id,name',
            'statusLogs' => fn ($q) => $q->with('changedBy:id,name')->orderBy('created_at'),
        ]);

        return response()->json(['data' => $appointment]);
    }

    /**
     * Dental assistant (or admin) flags a specific procedure this patient
     * can now self-book as a "Book a Follow-up" — per the dentist's
     * assessment during this (completed) visit. Only one open
     * recommendation at a time per appointment: re-enabling replaces it
     * (e.g. staff picked the wrong service) rather than stacking silently.
     * Booking itself still goes through the real doctor + date/time wizard
     * and the normal slot-conflict check — this only unlocks which service
     * the patient is allowed to pick there.
     */
    public function enableFollowUp(Request $request, Appointment $appointment)
    {
        if ($appointment->status !== 'completed') {
            return response()->json([
                'message' => 'A follow-up can only be enabled from a completed appointment.',
            ], 422);
        }

        $validated = $request->validate([
            'service_id' => ['required', 'integer', 'exists:services,id'],
        ]);

        $appointment->update([
            'recommended_follow_up_service_id' => $validated['service_id'],
            'follow_up_recommended_by' => $request->user()->id,
            'follow_up_recommended_at' => now(),
            'follow_up_fulfilled_at' => null,
        ]);

        $appointment->load(['patient:id,user_id', 'recommendedFollowUpService:id,name,duration_minutes', 'followUpRecommendedBy:id,name']);

        Notification::notifyUser(
            $appointment->patient->user_id,
            'Follow-up available',
            "You can now book a follow-up for {$appointment->recommendedFollowUpService->name}.",
            '/patient/appointments'
        );

        return response()->json(['data' => $appointment]);
    }

    /**
     * Staff-initiated cancel — same "still confirmed/pending and worth
     * cancelling" rule as the patient's own PatientAppointmentController::
     * cancel(), just actor-agnostic on which appointment (staff isn't
     * restricted to their own bookings) and actually notifies the patient
     * afterward, since staff cancelling on someone's behalf is exactly the
     * case where the patient might not otherwise find out. Reuses
     * AppointmentRejectedMail — no dedicated "cancelled by staff" mailable
     * exists, and the message ("your appointment didn't go through, here's
     * why, contact us to rebook") fits either way.
     */
    public function cancel(Request $request, Appointment $appointment)
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! in_array($appointment->status, ['confirmed', 'pending_verification'], true)) {
            return response()->json([
                'message' => 'Only a confirmed or pending appointment can be cancelled.',
            ], 422);
        }

        DB::transaction(function () use ($appointment, $validated, $request) {
            $oldStatus = $appointment->status;

            $appointment->update([
                'status' => 'cancelled',
                'cancellation_reason' => $validated['reason'] ?? null,
            ]);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => $oldStatus,
                'new_status' => 'cancelled',
                'changed_by' => $request->user()->id,
                'note' => 'Cancelled by staff.'.(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
            ]);
        });

        $appointment->load(['patient.user', 'dentist:id,name', 'service:id,name']);
        try {
            Mail::to($appointment->patient->user->email)->send(new AppointmentRejectedMail($appointment, $validated['reason'] ?? null));
        } catch (\Throwable $e) {
            Log::warning('Appointment email failed to send', [
                'mailable' => AppointmentRejectedMail::class,
                'appointment_id' => $appointment->id,
                'error' => $e->getMessage(),
            ]);
        }
        Notification::notifyUser(
            $appointment->patient->user_id,
            'Appointment cancelled',
            'Your '.$appointment->service->name.' appointment was cancelled by the clinic.'
                .(! empty($validated['reason']) ? ' Reason: '.$validated['reason'] : ''),
            '/patient/appointments'
        );

        return response()->json(['message' => 'Appointment cancelled.', 'data' => $appointment]);
    }

    /**
     * Staff marks a past confirmed/pending appointment as a no-show — the
     * resolution for exactly the "Awaiting Update" gap PatientAppointments.jsx
     * surfaces to the patient (a date that's already passed with nobody
     * ever recording what happened). Deliberately staff-only, not dentist-
     * only like complete(): whether a patient walked in is a front-desk
     * observation, not a clinical judgment, so it belongs with the same
     * actor who already has cancel() here — and staff's own "All
     * Appointments" is clinic-wide, covering every dentist, not just one's
     * own schedule. Only ever the enum value flip — never invents what
     * procedure would have happened, since nothing did.
     */
    public function noShow(Request $request, Appointment $appointment)
    {
        if (! in_array($appointment->status, ['confirmed', 'pending_verification'], true)) {
            return response()->json([
                'message' => 'Only a confirmed or pending appointment can be marked as no-show.',
            ], 422);
        }

        if ($appointment->appointment_date->toDateString() >= now()->toDateString()) {
            return response()->json([
                'message' => 'Only a past appointment can be marked as no-show.',
            ], 422);
        }

        DB::transaction(function () use ($appointment, $request) {
            $oldStatus = $appointment->status;

            $appointment->update(['status' => 'no_show']);

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => $oldStatus,
                'new_status' => 'no_show',
                'changed_by' => $request->user()->id,
                'note' => 'Marked as no-show by staff.',
            ]);
        });

        $appointment->load(['patient.user', 'dentist:id,name', 'service:id,name']);

        Notification::notifyUser(
            $appointment->patient->user_id,
            'Missed appointment recorded',
            'Your '.$appointment->service->name.' appointment on '.$appointment->appointment_date->format('M j').' was marked as a missed visit. Contact the clinic if this is a mistake.',
            '/patient/appointments'
        );

        return response()->json(['message' => 'Appointment marked as no-show.', 'data' => $appointment]);
    }

    /**
     * Lightweight patient lookup for the walk-in modal's patient picker —
     * matches by name or account email. No dedicated patient-search surface
     * exists yet (Patient Records is still a ComingSoon stub), so this is
     * intentionally minimal rather than a general-purpose patient API.
     */
    public function searchPatients(Request $request)
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:100'],
        ]);

        $term = $validated['q'];

        $patients = Patient::query()
            ->where(function ($q) use ($term) {
                $q->whereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$term}%"])
                    ->orWhereHas('user', fn ($uq) => $uq->where('email', 'like', "%{$term}%"));
            })
            ->with('user:id,email')
            ->limit(10)
            ->get(['id', 'user_id', 'patient_number', 'first_name', 'last_name', 'patient_type']);

        return response()->json(['data' => $patients]);
    }

    /**
     * Front-desk registration — a walk-in with no existing Smile Bay
     * account at all (a first-time patient, or someone who'll never use
     * the portal themselves — an elderly patient unfamiliar with the
     * online flow, for instance). Deliberately a much shorter form than
     * AuthController::register(): address/emergency contact are nullable
     * on patients already, so they're skipped here and can be filled in
     * later from the patient's own profile — the point is getting them
     * bookable in the next few minutes at the counter, not a full intake.
     *
     * Two things differ from self-service registration on purpose:
     *   - No OTP. The staff member is looking at this patient in person;
     *     that's a stronger identity check than an email round-trip, and
     *     matches how UserManagementController::store() already creates
     *     staff accounts pre-verified.
     *   - Email is optional. A patient with no email (or none they check)
     *     still needs a `users.email` value — it's unique/NOT NULL — so
     *     one is synthesized from their mobile number. They won't be able
     *     to log in with it (nobody hands them a password), which is
     *     correct: this account exists so the clinic can track them and
     *     staff can keep booking for them, not so they can self-serve.
     */
    public function registerWalkInPatient(Request $request)
    {
        $validated = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'date_of_birth' => ['required', 'date', 'before:today'],
            'sex' => ['required', 'in:male,female'],
            'mobile_number' => ['required', 'string', 'regex:/^(09\d{9}|\+639\d{9})$/', 'unique:users,mobile_number'],
            'email' => ['nullable', 'string', 'email', 'max:255', 'unique:users,email'],
            'patient_type' => ['required', 'in:cash,hmo'],
            'hmo_provider_id' => [
                'required_if:patient_type,hmo',
                'nullable',
                'integer',
                Rule::exists('hmo_providers', 'id')->where('is_active', true),
            ],
            'hmo_number' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:100'],
            'hmo_company_name' => ['required_if:patient_type,hmo', 'nullable', 'string', 'max:255'],
        ]);

        $email = $validated['email'] ?? preg_replace('/\D/', '', $validated['mobile_number']).'@walkin.smilebay.local';
        $fullName = trim(preg_replace('/\s+/', ' ',
            $validated['first_name'].' '.($validated['middle_name'] ?? '').' '.$validated['last_name']
        ));

        $patient = DB::transaction(function () use ($validated, $email, $fullName) {
            $user = User::create([
                'name' => $fullName,
                'email' => $email,
                'password' => Hash::make(Str::random(32)),
                'mobile_number' => $validated['mobile_number'],
                'role' => 'patient',
                'status' => 'active',
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();

            $patient = Patient::create([
                'user_id' => $user->id,
                'first_name' => $validated['first_name'],
                'middle_name' => $validated['middle_name'] ?? null,
                'last_name' => $validated['last_name'],
                'date_of_birth' => $validated['date_of_birth'],
                'sex' => $validated['sex'],
                'patient_type' => $validated['patient_type'],
                'hmo_provider_id' => $validated['patient_type'] === 'hmo' ? $validated['hmo_provider_id'] : null,
                'hmo_number' => $validated['patient_type'] === 'hmo' ? $validated['hmo_number'] : null,
                'hmo_company_name' => $validated['patient_type'] === 'hmo' ? $validated['hmo_company_name'] : null,
                // Staff is registering this patient in person — the
                // in-person interaction itself is the consent-capture
                // equivalent of the online wizard's checkbox.
                'consent_certified' => true,
            ]);
            $patient->update(['patient_number' => Patient::formatPatientNumber($patient->id, $patient->created_at)]);

            return $patient;
        });

        $patient->load('user:id,email');

        return response()->json(['data' => $patient], 201);
    }

    /**
     * Staff-initiated walk-in booking into a specific (typically just-freed)
     * slot. Re-validates via AppointmentSlotService::isSlotAvailable() inside
     * the same lockForUpdate-protected transaction pattern
     * AppointmentController::store() uses — never trust that the slot the
     * staff clicked is still actually free.
     *
     * Deliberately reuses the exact same cash-auto-confirm / HMO-pending /
     * pediatric-gate rules as the normal patient booking flow rather than
     * force-confirming outright, so a walk-in can't silently bypass HMO or
     * pediatric verification just because staff typed it in.
     */
    public function assignWalkIn(Request $request)
    {
        $validated = $request->validate([
            'patient_id' => ['required', 'integer', 'exists:patients,id'],
            'dentist_id' => [
                'required', 'integer',
                Rule::exists('users', 'id')->where('role', 'dentist')->where('status', 'active'),
            ],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'appointment_date' => ['required', 'date_format:Y-m-d'],
            'appointment_time' => ['required', 'date_format:H:i'],
        ]);

        $patient = Patient::findOrFail($validated['patient_id']);
        $service = Service::findOrFail($validated['service_id']);

        $dentistIsCredentialed = User::where('id', $validated['dentist_id'])
            ->whereHas('services', fn ($q) => $q->where('services.id', $service->id))
            ->exists();

        if (! $dentistIsCredentialed) {
            return response()->json(['message' => 'The selected dentist does not offer this service.'], 422);
        }

        $isPediatric = $service->isPediatric();

        // Same rule as AppointmentController::store() — the pediatric
        // dentist accepts Cash only, no HMO, whether the patient books
        // themselves or staff books it in for them over the phone/in person.
        if ($isPediatric && $patient->patient_type === 'hmo') {
            return response()->json([
                'message' => 'Pediatric Dentistry accepts Cash patients only — our pediatric dentist does not accept HMO coverage.',
            ], 422);
        }

        $appointment = DB::transaction(function () use ($validated, $patient, $service, $request, $isPediatric) {
            // Same automatic recommendation consumption as the patient's own
            // AppointmentController::store() — a patient may have an open
            // "Book a Follow-up" recommendation for this exact service that
            // staff is now booking directly (e.g. over the phone); this
            // marks it fulfilled so the patient's portal doesn't still show
            // it as bookable, and so the patient can't separately book a
            // duplicate for the same recommendation online.
            $recommendation = $this->followUps->findOpenRecommendation($patient->id, $service->id);

            $available = $this->slots->isSlotAvailable(
                $validated['dentist_id'],
                $validated['appointment_date'],
                $validated['appointment_time'],
                $service->duration_minutes,
            );

            if (! $available) {
                return null;
            }

            $status = $isPediatric
                ? 'pending_verification'
                : ($patient->patient_type === 'cash' ? 'confirmed' : 'pending_verification');

            $appointment = Appointment::create([
                'patient_id' => $patient->id,
                'dentist_id' => $validated['dentist_id'],
                'service_id' => $service->id,
                'appointment_date' => $validated['appointment_date'],
                'appointment_time' => $validated['appointment_time'],
                'status' => $status,
                'patient_type_snapshot' => $patient->patient_type,
            ]);

            if ($recommendation) {
                $this->followUps->markFulfilled($recommendation, $appointment);
            }

            AppointmentStatusLog::create([
                'appointment_id' => $appointment->id,
                'old_status' => null,
                'new_status' => $status,
                'changed_by' => $request->user()->id,
                'note' => 'Walk-in booked by staff into a freed slot.'.($isPediatric ? ' Pediatric — awaiting pediatric review.' : ''),
            ]);

            return $appointment;
        });

        if (! $appointment) {
            return response()->json([
                'message' => 'This time slot is no longer available. Please choose another.',
            ], 409);
        }

        $appointment->load(['patient.user', 'service:id,name,duration_minutes', 'dentist:id,name']);
        $patientEmail = $appointment->patient->user->email;

        if ($isPediatric) {
            try {
                Mail::to($patientEmail)->send(new PediatricBookingSubmittedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => PediatricBookingSubmittedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyUser(
                $validated['dentist_id'],
                'Pediatric review needed',
                "New {$appointment->service->name} booking from {$appointment->patient->first_name} {$appointment->patient->last_name} needs your review.",
                '/dentist/pediatric-queue'
            );
        } elseif ($appointment->patient_type_snapshot === 'hmo') {
            try {
                Mail::to($patientEmail)->send(new HmoBookingSubmittedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => HmoBookingSubmittedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
            Notification::notifyRolesOnce(
                ['dental_assistant', 'admin'],
                $appointment->id,
                'HMO verification needed',
                "New HMO booking from {$appointment->patient->first_name} {$appointment->patient->last_name} needs verification."
            );
        } else {
            try {
                Mail::to($patientEmail)->send(new AppointmentConfirmedMail($appointment));
            } catch (\Throwable $e) {
                Log::warning('Appointment email failed to send', [
                    'mailable' => AppointmentConfirmedMail::class,
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'message' => $appointment->status === 'confirmed'
                ? 'Walk-in appointment confirmed.'
                : 'Walk-in booked — pending verification.',
            'data' => $appointment,
        ], 201);
    }
}
