<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Appointment;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Admin-only "User Management" — every account in the system (any role),
 * searchable/filterable, with the ability to create new STAFF accounts
 * (dentist/dental_assistant/admin — patient accounts are self-registration
 * only via AuthController, never created here) and activate/deactivate any
 * account.
 */
class UserManagementController extends Controller
{
    // A patient counts as "dormant" (Archive's own suggestion criteria, and
    // what the Archived filter's caption compares against) with no
    // appointment of any status in this many months AND nothing upcoming —
    // matches the ~annual recall interval most dental practices already
    // work on. One shared constant so the suggestion count, the per-row
    // hint, and the dormant-only filter never quietly disagree.
    private const DORMANT_MONTHS = 12;

    public function index(Request $request)
    {
        $validated = $request->validate([
            'role' => ['nullable', 'in:patient,dentist,dental_assistant,admin'],
            // 'restricted'/'archived' are filter-only values, not real
            // users.status entries — both handled separately below since
            // they query the patients table, not the status column itself.
            'status' => ['nullable', 'in:active,inactive,restricted,archived'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            // 'cancellations_desc' backs the Cancellations column's sort
            // control (patient role only, in the frontend) — see the
            // 'frequent canceller' suspend-decision feature this exists for.
            'sort' => ['nullable', 'in:name_asc,cancellations_desc'],
            // Independent of `status` on purpose — the "Review N Patients"
            // suggestion banner filters to dormant-but-not-yet-archived
            // candidates, a different set from status=archived (already
            // archived) and orthogonal to Active/Inactive/Restricted, so
            // it isn't just another `status` option.
            'dormant' => ['nullable', 'boolean'],
        ]);

        $query = User::query()
            ->withCount([
                // Same patient-initiated-only scoping AND same
                // cancellation_count_reset_at cutoff as CancellationPolicyService
                // ::cancellationCount() — a staff/dentist cancelling on a
                // patient's behalf never counts here either, and an admin's
                // Lift Restriction/Activate resets this column back toward 0
                // exactly the way it resets the patient's own strike count,
                // so the two never show conflicting numbers for the same
                // patient. The reset cutoff is looked up via a correlated
                // scalar subquery (not a relation traversal) since it lives
                // on patients, one hop further than this subquery already
                // has a clean alias for.
                'patientAppointments as cancellation_count' => fn ($q) => $q
                    ->where('appointments.status', 'cancelled')
                    ->whereHas('statusLogs', fn ($sq) => $sq
                        ->where('new_status', 'cancelled')
                        ->whereColumn('changed_by', 'users.id')
                        ->whereRaw(
                            // Strictly after (>), not >= — see
                            // CancellationPolicyService::cancellationCount()'s
                            // own comment on why: a reset and the
                            // cancellation that triggered it can land in the
                            // same whole-second timestamp.
                            //
                            // The OUTER parens around the whole OR are load-
                            // bearing, not decoration: whereRaw() ANDs this
                            // string onto the preceding where()/whereColumn()
                            // calls, and SQL's AND binds tighter than OR — an
                            // unparenthesized "...IS NULL OR created_at > ..."
                            // would let the OR's right side satisfy the
                            // *entire* WHERE clause on its own, silently
                            // discarding the new_status/changed_by filters
                            // above for any row where created_at happens to
                            // be later than the reset cutoff. Caught this via
                            // a real (rolled-back) test where the count came
                            // back inflated after a reset, not by inspection.
                            '((select cancellation_count_reset_at from patients where patients.user_id = users.id) is null '
                            .'or appointment_status_log.created_at > (select cancellation_count_reset_at from patients where patients.user_id = users.id))'
                        )),
            ])
            // Surfaces the automatic 3-strike restriction (see
            // CancellationPolicyService) alongside the manual Deactivate
            // action, so admin sees both the count AND whether the system
            // already auto-restricted new bookings for this patient.
            // restriction_count is the separate, never-cleared history of
            // how many times this has happened in total (booking_restricted_at
            // itself resets to null every time it's lifted).
            ->with([
                'patient:id,user_id,booking_restricted_at,restriction_count,archived_at,archived_by,archive_reason',
                'patient.archivedBy:id,name',
            ])
            // A dentist's photo lives on dentist_profiles.photo_path, not a
            // users column (see avatarUtils.js's getAvatarUrl()) — without
            // this, the list always fell back to initials for dentists even
            // after they uploaded a real photo through My Profile.
            ->with('dentistProfile:id,user_id,photo_path')
            // Correlated scalar subqueries (same reasoning as the
            // cancellation_count_reset_at lookup above — patients is one hop
            // further than this query already has a clean alias for) —
            // drives the "No visit in..." hint and the dormant-suggestion
            // filter below. Non-patient rows get null/0, which the frontend
            // already treats as "not applicable" the same way it does for
            // cancellation_count.
            ->addSelect([
                'last_appointment_date' => Appointment::query()
                    ->selectRaw('MAX(appointments.appointment_date)')
                    ->join('patients', 'patients.id', '=', 'appointments.patient_id')
                    ->whereColumn('patients.user_id', 'users.id'),
                'has_upcoming_appointment' => Appointment::query()
                    ->selectRaw('COUNT(*) > 0')
                    ->join('patients', 'patients.id', '=', 'appointments.patient_id')
                    ->whereColumn('patients.user_id', 'users.id')
                    ->where('appointments.appointment_date', '>=', now()->toDateString())
                    ->whereIn('appointments.status', ['pending_verification', 'confirmed']),
            ]);

        if (! empty($validated['role'])) {
            $query->where('role', $validated['role']);
        }

        if (($validated['status'] ?? null) === 'archived') {
            // The one filter value that means "show archived", full stop —
            // every other branch below actively EXCLUDES archived patients
            // (see the else arm), matching how real practice-management
            // software hides archived records from the default list.
            $query->whereHas('patient', fn ($q) => $q->whereNotNull('archived_at'));
        } else {
            $query->where(fn ($q) => $q->where('role', '!=', 'patient')->orWhereHas('patient', fn ($q2) => $q2->whereNull('archived_at')));

            if (($validated['status'] ?? null) === 'restricted') {
                // A restricted account is still status='active' underneath
                // (see CancellationPolicyService) — this is the one filter
                // value that doesn't map onto the status column directly.
                $query->where('status', 'active')->whereHas('patient', fn ($q) => $q->whereNotNull('booking_restricted_at'));
            } elseif (! empty($validated['status'])) {
                $query->where('status', $validated['status']);
            }

            if ($request->boolean('dormant')) {
                $query->where(fn ($q) => $this->applyDormantScope($q));
            }
        }
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
        }

        if (($validated['sort'] ?? null) === 'cancellations_desc') {
            $query->orderByDesc('cancellation_count')->orderBy('name');
        } else {
            $query->orderBy('name');
        }

        $perPage = $validated['per_page'] ?? 10;

        return response()->json($query->paginate($perPage)->withQueryString());
    }

    /**
     * Create a new staff account. Patient accounts are never created here —
     * that's self-registration + OTP verification only (AuthController).
     * Staff are provisioned already-verified/active by an admin who vouches
     * for them internally, with a system-generated temporary password
     * returned once so the admin can hand it off out-of-band — no invite-
     * email dependency needed.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'mobile_number' => ['required', 'string', 'regex:/^(09\d{9}|\+639\d{9})$/', 'unique:users,mobile_number'],
            'role' => ['required', 'in:dentist,dental_assistant,admin'],
        ]);

        $temporaryPassword = Str::password(12);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'mobile_number' => $validated['mobile_number'],
            'role' => $validated['role'],
            'status' => 'active',
            'password' => Hash::make($temporaryPassword),
        ]);

        // email_verified_at isn't mass-assignable (never accepted directly
        // from client input elsewhere in the app either — see
        // AuthController::verifyOtp()) — set it explicitly so a staff
        // account created here doesn't get silently stuck at "unverified".
        $user->forceFill(['email_verified_at' => now()])->save();

        ActivityLog::record(
            $request->user()->id,
            'staff_account_created',
            "{$request->user()->name} created a new {$validated['role']} account for {$user->name}."
        );

        return response()->json(['data' => $user, 'temporary_password' => $temporaryPassword], 201);
    }

    /**
     * Edit an account's basic info and/or role. Deliberately does NOT allow
     * changing to/from 'patient' — a role reassignment into or out of the
     * patient role would orphan (or falsely attach) a patients row, which
     * this endpoint has no business doing; role stays restricted to the
     * three staff roles for a staff account, or locked to 'patient' for a
     * patient account.
     */
    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'mobile_number' => [
                'sometimes', 'string', 'regex:/^(09\d{9}|\+639\d{9})$/',
                Rule::unique('users', 'mobile_number')->ignore($user->id),
            ],
            'role' => [
                'sometimes',
                Rule::in($user->role === 'patient' ? ['patient'] : ['dentist', 'dental_assistant', 'admin']),
            ],
        ]);

        $user->update($validated);

        return response()->json(['data' => $user->fresh()]);
    }

    /**
     * Toggle an account's active/inactive status — the only lever this app
     * has for "disabling" a user rather than deleting them (login already
     * blocks inactive accounts, see AuthController::login()). Guards
     * against an admin locking themselves out.
     *
     * Reactivating a patient also lifts any standing booking restriction —
     * CancellationPolicyService::evaluateAfterCancellation() sets both
     * status=inactive AND booking_restricted_at together (a patient who
     * cancels again while already restricted gets fully deactivated, on
     * top of the restriction that was already there), but never clears
     * booking_restricted_at on its own. Without this, "Activate" here would
     * only undo half of that: the account logs in again but immediately
     * shows right back up as "Restricted Account" with booking still
     * blocked, needing a second, non-obvious "Lift Restriction" click to
     * actually finish restoring it. Admin clicking "Activate" means the
     * account is back in good standing on both fronts — including a reset
     * cancellation_count_reset_at, a genuine clean slate on the strike
     * count itself (see CancellationPolicyService's own doc comment),
     * not just the block being removed while the count still sits at 3+.
     */
    public function updateStatus(Request $request, User $user)
    {
        $validated = $request->validate([
            'status' => ['required', 'in:active,inactive'],
        ]);

        if ($user->id === $request->user()->id && $validated['status'] === 'inactive') {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        $user->update(['status' => $validated['status']]);

        if ($validated['status'] === 'active' && $user->patient?->isBookingRestricted()) {
            $user->patient->update(['booking_restricted_at' => null, 'cancellation_count_reset_at' => now()]);
            Notification::notifyUser(
                $user->id,
                'Account reactivated',
                'Your account is active again and you can book new appointments.',
                '/patient/book-appointment'
            );
        }

        ActivityLog::record(
            $request->user()->id,
            $validated['status'] === 'active' ? 'account_activated' : 'account_deactivated',
            "{$request->user()->name} " . ($validated['status'] === 'active' ? 'activated' : 'deactivated') . " {$user->name}'s account."
        );

        return response()->json(['data' => $user->fresh()->load('patient:id,user_id,booking_restricted_at,restriction_count')]);
    }

    /**
     * Manually lifts the automatic 3-strike booking restriction (see
     * CancellationPolicyService) — the only way it ever gets removed; the
     * system itself never clears it on its own. Deliberately separate from
     * updateStatus() above: this only ever touches booking_restricted_at
     * (self-service booking eligibility), never the account's login status.
     * Also resets cancellation_count_reset_at — a genuine clean slate on
     * the strike count itself (see CancellationPolicyService's own doc
     * comment), not just the block being removed while the count that
     * triggered it still sits at 3+ and re-fires on the next cancellation.
     */
    public function unrestrictBooking(Request $request, User $user)
    {
        $patient = $user->patient;

        if (! $patient) {
            return response()->json(['message' => 'This account has no patient profile.'], 422);
        }

        if (! $patient->isBookingRestricted()) {
            return response()->json(['message' => 'This account is not currently restricted.'], 422);
        }

        $patient->update(['booking_restricted_at' => null, 'cancellation_count_reset_at' => now()]);

        Notification::notifyUser(
            $user->id,
            'Booking restriction lifted',
            'Your account can now book new appointments again.',
            '/patient/book-appointment'
        );
        ActivityLog::record(
            $request->user()->id,
            'restriction_lifted',
            "{$request->user()->name} lifted the booking restriction on {$user->name}'s account."
        );

        return response()->json(['data' => $user->fresh()->load('patient:id,user_id,booking_restricted_at,restriction_count')]);
    }

    /**
     * Archive a dormant patient — always a deliberate admin action (see
     * Patient::isArchived()'s own doc comment: never automatic), reason
     * optional and purely for admin's own future reference. Deliberately
     * does not touch users.status, booking_restricted_at, or anything else
     * about the account's standing — archiving only affects whether this
     * patient shows up in the DEFAULT User Management list, nothing about
     * whether they can log in or book.
     */
    public function archivePatient(Request $request, User $user)
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $patient = $user->patient;

        if (! $patient) {
            return response()->json(['message' => 'This account has no patient profile.'], 422);
        }

        if ($patient->isArchived()) {
            return response()->json(['message' => 'This patient is already archived.'], 422);
        }

        $patient->update([
            'archived_at' => now(),
            'archived_by' => $request->user()->id,
            'archive_reason' => $validated['reason'] ?? null,
        ]);

        ActivityLog::record(
            $request->user()->id,
            'patient_archived',
            "{$request->user()->name} archived {$user->name}'s patient record."
        );

        return response()->json([
            'data' => $user->fresh()->load(['patient:id,user_id,booking_restricted_at,restriction_count,archived_at,archived_by,archive_reason', 'patient.archivedBy:id,name']),
        ]);
    }

    /**
     * Restore an archived patient — single action, no confirmation needed
     * on the frontend (unlike archiving, there's nothing here to weigh: it
     * only ever moves someone back to being visible in the default list).
     * The SAME thing also happens automatically, silently, the moment an
     * archived patient books a new appointment (see
     * AppointmentController::store()) — this endpoint is the manual
     * equivalent for when admin wants to do it without waiting for that.
     */
    public function restorePatient(Request $request, User $user)
    {
        $patient = $user->patient;

        if (! $patient) {
            return response()->json(['message' => 'This account has no patient profile.'], 422);
        }

        if (! $patient->isArchived()) {
            return response()->json(['message' => 'This patient is not currently archived.'], 422);
        }

        $patient->update(['archived_at' => null, 'archived_by' => null, 'archive_reason' => null]);

        ActivityLog::record(
            $request->user()->id,
            'patient_restored',
            "{$request->user()->name} restored {$user->name}'s patient record from the archive."
        );

        return response()->json([
            'data' => $user->fresh()->load('patient:id,user_id,booking_restricted_at,restriction_count,archived_at'),
        ]);
    }

    /**
     * Admin-issued password reset — a fallback for when the account holder
     * genuinely can't get in any other way (e.g. a just-created staff
     * account's one-time temporary password was lost before it could be
     * copied down, before they've ever logged in once). The normal path
     * stays self-service Forgot Password (AuthController::forgotPassword/
     * resetPassword, email-OTP verified, no admin involved) — this exists
     * only because that path assumes the account holder still has access
     * to their own inbox, which a brand-new staff account can't be assumed
     * to have exercised yet.
     *
     * Same response shape as store() — a system-generated temporary
     * password returned once for the admin to hand off out-of-band, never
     * stored in plain text. Invalidates any existing sessions so a stale
     * logged-in session elsewhere doesn't outlive this.
     */
    public function resetPassword(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Use My Profile to change your own password.'], 422);
        }

        $temporaryPassword = Str::password(12);

        DB::transaction(function () use ($user, $temporaryPassword) {
            $user->forceFill(['password' => Hash::make($temporaryPassword)])->save();
            DB::table('sessions')->where('user_id', $user->id)->delete();
        });

        ActivityLog::record(
            $request->user()->id,
            'password_reset_by_admin',
            "{$request->user()->name} reset {$user->name}'s password."
        );

        return response()->json(['data' => $user->fresh(), 'temporary_password' => $temporaryPassword]);
    }

    /**
     * Backs the "N patients haven't visited in over 12 months" suggestion
     * banner — a plain count using the exact same dormant criteria index()
     * itself filters by by (see DORMANT_MONTHS), so the banner's number and
     * what "Review N Patients" actually shows can never disagree.
     */
    public function dormantCount(Request $request)
    {
        $count = $this->applyDormantScope(User::query())->count();

        return response()->json(['count' => $count]);
    }

    /**
     * Shared by index()'s dormant=1 filter and dormantCount() above — one
     * definition of "dormant" so the suggestion banner's number and what
     * "Review N Patients" actually lists can never quietly disagree with
     * each other. Real WHERE conditions (not a reuse of the addSelect()
     * aliases in index(): a SELECT alias can't be referenced in WHERE,
     * MySQL evaluates WHERE before SELECT).
     */
    private function applyDormantScope($query)
    {
        $dormantCutoff = now()->subMonths(self::DORMANT_MONTHS)->toDateString();

        return $query
            ->where('role', 'patient')
            ->whereHas('patient', fn ($q) => $q->whereNull('archived_at'))
            ->where(function ($q) use ($dormantCutoff) {
                $q->whereRaw(
                    '(select max(a.appointment_date) from appointments a inner join patients p on p.id = a.patient_id where p.user_id = users.id) is null'
                )->orWhereRaw(
                    '(select max(a.appointment_date) from appointments a inner join patients p on p.id = a.patient_id where p.user_id = users.id) < ?',
                    [$dormantCutoff]
                );
            })
            ->whereRaw(
                'not exists (select 1 from appointments a inner join patients p on p.id = a.patient_id '
                .'where p.user_id = users.id and a.appointment_date >= ? and a.status in (?, ?))',
                [now()->toDateString(), 'pending_verification', 'confirmed']
            );
    }
}
