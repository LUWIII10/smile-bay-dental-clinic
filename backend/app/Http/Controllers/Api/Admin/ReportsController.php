<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin-only "Reports" — operational analytics only (appointment volume,
 * status mix, payment-type split, service/dentist popularity, new-patient
 * growth). Deliberately no revenue/billing figures anywhere — this project
 * has no payment-amount data model at all (patient_type is cash-vs-HMO
 * *coverage*, not a transaction ledger), matching the app's established
 * appointment-scheduling + patient-records scope.
 */
class ReportsController extends Controller
{
    public function overview(Request $request)
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $dateFrom = $validated['date_from'] ?? now()->startOfMonth()->toDateString();
        $dateTo = $validated['date_to'] ?? now()->endOfMonth()->toDateString();

        $scoped = fn () => Appointment::whereBetween('appointment_date', [$dateFrom, $dateTo]);

        $statusCounts = $scoped()
            ->select('status', DB::raw('count(*) as count'))
            ->groupBy('status')
            ->pluck('count', 'status');

        $byDay = $scoped()
            ->select(DB::raw('DATE(appointment_date) as date'), DB::raw('count(*) as count'))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $paymentSplit = $scoped()
            ->select('patient_type_snapshot', DB::raw('count(*) as count'))
            ->groupBy('patient_type_snapshot')
            ->pluck('count', 'patient_type_snapshot');

        $topServices = $scoped()
            ->join('services', 'services.id', '=', 'appointments.service_id')
            ->select('services.name', DB::raw('count(*) as count'))
            ->groupBy('services.name')
            ->orderByDesc('count')
            ->limit(5)
            ->get();

        $byDentist = $scoped()
            ->join('users', 'users.id', '=', 'appointments.dentist_id')
            ->select('users.name', DB::raw('count(*) as count'))
            ->groupBy('users.name')
            ->orderByDesc('count')
            ->get();

        $newPatients = Patient::whereBetween('created_at', ["{$dateFrom} 00:00:00", "{$dateTo} 23:59:59"])->count();

        return response()->json(['data' => [
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'totals' => [
                'total_appointments' => array_sum($statusCounts->toArray()),
                'confirmed' => $statusCounts->get('confirmed', 0),
                'pending_verification' => $statusCounts->get('pending_verification', 0),
                'completed' => $statusCounts->get('completed', 0),
                'cancelled' => $statusCounts->get('cancelled', 0),
                'rejected' => $statusCounts->get('rejected', 0),
                'no_show' => $statusCounts->get('no_show', 0),
                'new_patients' => $newPatients,
            ],
            'by_day' => $byDay,
            'payment_split' => [
                'cash' => $paymentSplit->get('cash', 0),
                'hmo' => $paymentSplit->get('hmo', 0),
            ],
            'top_services' => $topServices,
            'by_dentist' => $byDentist,
        ]]);
    }
}
