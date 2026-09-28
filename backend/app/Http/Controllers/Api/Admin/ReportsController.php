<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Patient;
use Barryvdh\DomPDF\Facade\Pdf;
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
        [$dateFrom, $dateTo] = $this->resolveRange($request);

        return response()->json(['data' => $this->buildOverview($dateFrom, $dateTo)]);
    }

    /**
     * Same figures as overview() above, rendered as a real (text, not
     * rasterized) PDF via dompdf — the "Download PDF" button next to
     * Reports.jsx's existing browser-print "Print Report" button. Shares
     * buildOverview() so the two can never drift apart.
     */
    public function downloadPdf(Request $request)
    {
        [$dateFrom, $dateTo] = $this->resolveRange($request);
        $data = $this->buildOverview($dateFrom, $dateTo);

        $totals = $data['totals'];
        $completionRate = $totals['total_appointments']
            ? round($totals['completed'] / $totals['total_appointments'] * 100)
            : 0;

        $paymentTotal = $data['payment_split']['cash'] + $data['payment_split']['hmo'];
        $cashPct = $paymentTotal ? round($data['payment_split']['cash'] / $paymentTotal * 100) : 0;
        $hmoPct = $paymentTotal ? round($data['payment_split']['hmo'] / $paymentTotal * 100) : 0;

        $servicesTotal = collect($data['top_services'])->sum('count');
        $dentistTotal = collect($data['by_dentist'])->sum('count');
        $pct = fn ($count, $total) => $total ? round($count / $total * 100, 1) : 0.0;

        $avgPerDay = count($data['by_day']) ? round($totals['total_appointments'] / count($data['by_day']), 1) : 0;
        $peakDay = collect($data['by_day'])->sortByDesc('count')->first();

        $pdf = Pdf::loadView('pdf.clinic-operations-report', [
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'generatedAt' => now(),
            'totals' => $totals,
            'completionRate' => $completionRate,
            'paymentSplit' => $data['payment_split'],
            'paymentTotal' => $paymentTotal,
            'cashPct' => $cashPct,
            'hmoPct' => $hmoPct,
            'topServices' => $data['top_services'],
            'byDentist' => $data['by_dentist'],
            'servicesTotal' => $servicesTotal,
            'dentistTotal' => $dentistTotal,
            'pct' => $pct,
            'avgPerDay' => $avgPerDay,
            'peakDay' => $peakDay,
            'dayCount' => count($data['by_day']),
        ]);

        return $pdf->download("clinic-operations-report-{$dateFrom}-to-{$dateTo}.pdf");
    }

    private function resolveRange(Request $request): array
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        return [
            $validated['date_from'] ?? now()->startOfMonth()->toDateString(),
            $validated['date_to'] ?? now()->endOfMonth()->toDateString(),
        ];
    }

    private function buildOverview(string $dateFrom, string $dateTo): array
    {
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

        return [
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
        ];
    }
}
