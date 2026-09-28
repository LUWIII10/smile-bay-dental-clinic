<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\AppointmentStatusLog;
use App\Models\Patient;
use App\Models\User;

/**
 * Clinic-wide (not per-user-scoped) stat cards shared by the Admin and
 * Dental Assistant dashboards — both roles see the exact same four
 * operational numbers, so this lives in one place rather than being
 * duplicated across two dashboard-specific controllers.
 */
class DashboardController extends Controller
{
    public function staffSummary()
    {
        $today = now()->toDateString();
        $weekStart = now()->startOfWeek()->toDateString();
        $weekEnd = now()->endOfWeek()->toDateString();

        $todayCount = Appointment::whereIn('status', ['confirmed', 'completed'])
            ->where('appointment_date', $today)
            ->count();

        // Matches exactly what StaffVerificationController::index() shows —
        // HMO, still pending, and (if pediatric) already cleared by the
        // pediatric dentist — via the shared Appointment::scopeAwaitingHmoVerification()
        // scope, so this count and that queue can never drift apart. A plain
        // status='pending_verification' count previously overcounted: a
        // pediatric booking awaiting the pediatric dentist's own slot
        // confirmation isn't something a dental assistant can act on, cash
        // or HMO, so it doesn't belong in a card labeled "Pending
        // Verifications" that links to the HMO queue.
        $pendingVerifications = Appointment::awaitingHmoVerification()->count();

        $confirmedToday = Appointment::where('status', 'confirmed')
            ->where('appointment_date', $today)
            ->count();

        $completedThisWeek = Appointment::where('status', 'completed')
            ->whereBetween('appointment_date', [$weekStart, $weekEnd])
            ->count();

        $totalPatients = Patient::count();
        $activeUsers = User::where('status', 'active')->count();

        // Only ever rendered on AdminDashboard.jsx (AssistantDashboard.jsx
        // shares this same endpoint but doesn't read this field) — links to
        // User Management, admin-only, so no reason to add it there too.
        $restrictedAccounts = Patient::whereNotNull('booking_restricted_at')->count();

        return response()->json([
            'data' => [
                'today' => $todayCount,
                'pendingVerifications' => $pendingVerifications,
                'confirmedToday' => $confirmedToday,
                'completedThisWeek' => $completedThisWeek,
                'totalPatients' => $totalPatients,
                'activeUsers' => $activeUsers,
                'restrictedAccounts' => $restrictedAccounts,
            ],
        ]);
    }

    /**
     * System-wide recent activity for the Admin dashboard — the latest N
     * entries from AppointmentStatusLog, which is already an append-only
     * audit trail populated by every booking/confirm/reject/cancel/
     * reschedule/verify action across the app. Reusing it here means this
     * list can never drift out of sync with what actually happened.
     */
    public function recentActivity()
    {
        $logs = AppointmentStatusLog::with([
            'appointment.patient:id,first_name,last_name',
            'appointment.service:id,name',
            'changedBy:id,name,role',
        ])
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        $activity = $logs->map(function (AppointmentStatusLog $log) {
            $patientName = trim(
                ($log->appointment?->patient?->first_name ?? '').' '.($log->appointment?->patient?->last_name ?? '')
            ) ?: 'A patient';
            $serviceName = $log->appointment?->service?->name ?? 'an appointment';
            $actorName = $log->changedBy?->name ?? 'System';

            return [
                'id' => $log->id,
                // Kept alongside the structured fields below (not replaced
                // by them) so the Admin dashboard's table can be reverted to
                // this sentence with a one-line frontend change if it ever
                // needs to be, without touching the backend again.
                'description' => "{$patientName}'s {$serviceName} moved to \"{$log->new_status}\" (by {$actorName})",
                'patient_name' => $patientName,
                'service_name' => $serviceName,
                'status' => $log->new_status,
                'changed_by' => $actorName,
                'timestamp' => $log->created_at?->diffForHumans(),
            ];
        });

        return response()->json(['data' => $activity]);
    }
}
