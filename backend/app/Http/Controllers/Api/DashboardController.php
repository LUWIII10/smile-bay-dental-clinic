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

        // A pending_verification row is, by construction, either sitting in
        // the pediatric queue (pediatric_confirmed_at still null) or the
        // staff HMO queue (pediatric-confirmed already, or never pediatric
        // to begin with) — see PediatricVerificationController::index() and
        // StaffVerificationController::index()'s own filters. The two sets
        // are mutually exclusive and jointly exhaustive of every
        // pending_verification row, so a single status count already IS the
        // combined total — no need to run both queue queries separately.
        $pendingVerifications = Appointment::where('status', 'pending_verification')->count();

        $confirmedToday = Appointment::where('status', 'confirmed')
            ->where('appointment_date', $today)
            ->count();

        $completedThisWeek = Appointment::where('status', 'completed')
            ->whereBetween('appointment_date', [$weekStart, $weekEnd])
            ->count();

        $totalPatients = Patient::count();
        $activeUsers = User::where('status', 'active')->count();

        return response()->json([
            'data' => [
                'today' => $todayCount,
                'pendingVerifications' => $pendingVerifications,
                'confirmedToday' => $confirmedToday,
                'completedThisWeek' => $completedThisWeek,
                'totalPatients' => $totalPatients,
                'activeUsers' => $activeUsers,
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
                'description' => "{$patientName}'s {$serviceName} moved to \"{$log->new_status}\" (by {$actorName})",
                'timestamp' => $log->created_at?->diffForHumans(),
            ];
        });

        return response()->json(['data' => $activity]);
    }
}
