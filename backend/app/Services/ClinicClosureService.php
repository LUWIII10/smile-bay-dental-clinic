<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\ClinicClosure;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * CRUD + conflict-safety for clinic-wide closure dates — the clinic-level
 * counterpart to DentistAvailabilityService, which only ever scopes to one
 * dentist. Deliberately stricter than that service's "Save Anyway" pattern:
 * a closure is never force-created over existing appointments. Every
 * conflicting appointment must be moved first (via the existing staff
 * direct-reschedule action), so store() keeps returning the conflict list
 * until it's genuinely empty.
 */
class ClinicClosureService
{
    // Matches AppointmentSlotService::OCCUPYING_STATUSES /
    // DentistAvailabilityService::CONFLICT_STATUSES — only these represent a
    // real, standing commitment worth blocking a closure over.
    private const CONFLICT_STATUSES = ['pending_verification', 'confirmed'];

    public function upcoming(): array
    {
        return ClinicClosure::where('date', '>=', now()->toDateString())
            ->orderBy('date')
            ->get(['id', 'date', 'reason'])
            ->map(fn (ClinicClosure $c) => [
                'id' => $c->id,
                'date' => $c->date->toDateString(),
                'reason' => $c->reason,
            ])
            ->values()
            ->all();
    }

    /**
     * Appointments (confirmed/pending) already booked on this date, clinic-
     * wide — every dentist, not just one. Carries the raw ids a conflict row
     * needs to be reopened directly in RescheduleModal (dentist_id,
     * service_id, appointment_date/time), not just display strings.
     */
    public function conflictsForClosure(string $date): Collection
    {
        return Appointment::where('appointment_date', $date)
            ->whereIn('status', self::CONFLICT_STATUSES)
            ->with(['patient:id,first_name,last_name', 'service:id,name', 'dentist:id,name'])
            ->get()
            ->values();
    }

    public function formatConflicts(Collection $appointments): array
    {
        return $appointments->map(fn (Appointment $a) => [
            'id' => $a->id,
            'appointment_date' => $a->appointment_date->toDateString(),
            'appointment_time' => Carbon::parse($a->appointment_time)->format('H:i'),
            'dentist_id' => $a->dentist_id,
            'service_id' => $a->service_id,
            'dentist_name' => $a->dentist->name ?? 'Unknown',
            'patient_name' => trim(($a->patient->first_name ?? '').' '.($a->patient->last_name ?? '')) ?: 'Unknown patient',
            'service_name' => $a->service->name ?? null,
        ])->all();
    }

    public function store(string $date, ?string $reason): ClinicClosure
    {
        return ClinicClosure::create(['date' => $date, 'reason' => $reason]);
    }

    /**
     * Per-day appointment counts (clinic-wide, confirmed/pending) plus
     * which dates are already closed, for every date in the given month —
     * what the "Add Closure Date" calendar colors each cell by, so an admin
     * can see upfront which dates will trigger the reschedule-first flow
     * before even picking one. Deliberately NOT the same
     * available/limited/full slot-capacity status the booking calendars
     * use — there's no single dentist/service here, it's clinic-wide, so
     * "does this date already have bookings" is the only thing that matters.
     */
    public function daySummary(string $monthKey): array
    {
        $start = Carbon::createFromFormat('Y-m-d', "{$monthKey}-01")->startOfMonth();
        $end = $start->copy()->endOfMonth();

        // Plain query builder, not the Eloquent model — appointment_date is
        // being plucked as the KEY here, which Eloquent's own pluck() cast
        // handling doesn't cover (only the value column), so this sidesteps
        // any doubt about the key's string format by reading the native
        // MySQL DATE column directly (always 'Y-m-d' as PDO returns it).
        $counts = DB::table('appointments')
            ->whereBetween('appointment_date', [$start->toDateString(), $end->toDateString()])
            ->whereIn('status', self::CONFLICT_STATUSES)
            ->selectRaw('appointment_date, count(*) as c')
            ->groupBy('appointment_date')
            ->pluck('c', 'appointment_date');

        $closedDates = ClinicClosure::whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->pluck('date')
            ->map(fn ($d) => $d->toDateString())
            ->all();

        $summary = [];
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $dateKey = $cursor->toDateString();
            $summary[$dateKey] = [
                'appointment_count' => (int) ($counts[$dateKey] ?? 0),
                'closed' => in_array($dateKey, $closedDates, true),
            ];
            $cursor->addDay();
        }

        return $summary;
    }
}
