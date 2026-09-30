<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin-only "Activity Log" — every account/booking action recorded via
 * ActivityLog::record() across the whole app, filterable and searchable.
 * Read-only: nothing here ever writes a row, only the many call sites
 * scattered through the other controllers do that (see ActivityLog's own
 * doc comment for why it's a plain static call instead of an injected
 * service).
 */
class ActivityLogController extends Controller
{
    // Kept in sync with the ACTION_META map in frontend/src/pages/portal/
    // ActivityLog.jsx (label + pill color + icon) — the frontend owns the
    // display mapping, this only needs the valid key list to validate
    // against and to back the "Activity Type" filter's option list.
    public const ACTIONS = [
        'account_created' => 'Account Created',
        'staff_account_created' => 'Staff Account Created',
        'password_changed' => 'Password Changed',
        'profile_updated' => 'Profile Updated',
        'appointment_booked' => 'Appointment Booked',
        'appointment_cancelled' => 'Appointment Cancelled',
        'appointment_rejected' => 'Appointment Rejected',
        'hmo_verified' => 'HMO Coverage Verified',
        'hmo_info_updated' => 'HMO Info Updated',
        'account_restricted' => 'Account Restricted',
        'restriction_lifted' => 'Restriction Lifted',
        'account_activated' => 'Account Activated',
        'account_deactivated' => 'Account Deactivated',
        'patient_archived' => 'Patient Archived',
        'patient_restored' => 'Patient Restored',
        'password_reset_by_admin' => 'Password Reset by Admin',
    ];

    public function index(Request $request)
    {
        $validated = $request->validate([
            'role' => ['nullable', 'in:patient,dentist,dental_assistant,admin'],
            'action' => ['nullable', Rule::in(array_keys(self::ACTIONS))],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = ActivityLog::query()
            // system_backfill_completed is an internal marker row
            // (BackfillActivityLog's own idempotency guard) — never a real
            // event, so it never belongs in what admin actually sees here.
            ->where('action', '!=', 'system_backfill_completed')
            // A dentist's photo lives on dentist_profiles.photo_path, not a
            // users column (see avatarUtils.js's getAvatarUrl()) — without
            // this the User column always falls back to initials for
            // dentists even after they upload a real photo.
            ->with(['actor:id,name,role,avatar_path', 'actor.dentistProfile:id,user_id,photo_path'])
            ->orderByDesc('created_at');

        if (! empty($validated['role'])) {
            $query->whereHas('actor', fn ($q) => $q->where('role', $validated['role']));
        }
        if (! empty($validated['action'])) {
            $query->where('action', $validated['action']);
        }
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->whereHas('actor', fn ($q) => $q->where('name', 'like', "%{$search}%"));
        }
        if (! empty($validated['date_from'])) {
            $query->whereDate('created_at', '>=', $validated['date_from']);
        }
        if (! empty($validated['date_to'])) {
            $query->whereDate('created_at', '<=', $validated['date_to']);
        }

        $perPage = $validated['per_page'] ?? 15;

        return response()->json($query->paginate($perPage)->withQueryString());
    }
}
