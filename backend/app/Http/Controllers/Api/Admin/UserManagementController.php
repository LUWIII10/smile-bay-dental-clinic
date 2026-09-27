<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
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
    public function index(Request $request)
    {
        $validated = $request->validate([
            'role' => ['nullable', 'in:patient,dentist,dental_assistant,admin'],
            'status' => ['nullable', 'in:active,inactive'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            // 'cancellations_desc' backs the Cancellations column's sort
            // control (patient role only, in the frontend) — see the
            // 'frequent canceller' suspend-decision feature this exists for.
            'sort' => ['nullable', 'in:name_asc,cancellations_desc'],
        ]);

        $query = User::query()
            ->withCount([
                'patientAppointments as cancellation_count' => fn ($q) => $q->where('status', 'cancelled'),
            ])
            // Surfaces the automatic 3-strike restriction (see
            // CancellationPolicyService) alongside the manual Deactivate
            // action, so admin sees both the count AND whether the system
            // already auto-restricted new bookings for this patient.
            ->with('patient:id,user_id,booking_restricted_at')
            // A dentist's photo lives on dentist_profiles.photo_path, not a
            // users column (see avatarUtils.js's getAvatarUrl()) — without
            // this, the list always fell back to initials for dentists even
            // after they uploaded a real photo through My Profile.
            ->with('dentistProfile:id,user_id,photo_path');

        if (! empty($validated['role'])) {
            $query->where('role', $validated['role']);
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
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
     * account is back in good standing on both fronts.
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
            $user->patient->update(['booking_restricted_at' => null]);
            Notification::notifyUser(
                $user->id,
                'Account reactivated',
                'Your account is active again and you can book new appointments.',
                '/patient/book-appointment'
            );
        }

        return response()->json(['data' => $user->fresh()->load('patient:id,user_id,booking_restricted_at')]);
    }

    /**
     * Manually lifts the automatic 3-strike booking restriction (see
     * CancellationPolicyService) — the only way it ever gets removed; the
     * system itself never clears it on its own. Deliberately separate from
     * updateStatus() above: this only ever touches booking_restricted_at
     * (self-service booking eligibility), never the account's login status.
     */
    public function unrestrictBooking(User $user)
    {
        $patient = $user->patient;

        if (! $patient) {
            return response()->json(['message' => 'This account has no patient profile.'], 422);
        }

        if (! $patient->isBookingRestricted()) {
            return response()->json(['message' => 'This account is not currently restricted.'], 422);
        }

        $patient->update(['booking_restricted_at' => null]);

        Notification::notifyUser(
            $user->id,
            'Booking restriction lifted',
            'Your account can now book new appointments again.',
            '/patient/book-appointment'
        );

        return response()->json(['data' => $user->fresh()->load('patient:id,user_id,booking_restricted_at')]);
    }
}
