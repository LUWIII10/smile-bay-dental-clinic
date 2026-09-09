<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Dynamic block-scheduling math shared by the available-slots endpoint and
 * appointment creation/reschedule — both need the exact same "is this
 * dentist free at this date+time for a procedure of this length" answer,
 * so the algorithm lives here once instead of drifting between callers.
 */
class AppointmentSlotService
{
    // Absolute latest a slot may start, regardless of procedure length —
    // e.g. a 45-min slot grid runs 9:00, 9:45, 10:30... and never offers a
    // start past 16:30 even if the procedure would still finish before
    // close. Combined with lastBookableStart()'s close_time - duration
    // check below (belt-and-suspenders: today's 90-min max service always
    // finishes exactly at 18:00 from a 16:30 start, but this stops a future,
    // longer service from ever being offered a start that would run it past
    // close).
    private const LAST_BOOKING_START = '16:30';

    // Appointments in these statuses hold their slot on the calendar.
    // Cancelled/rejected/no_show free it back up (freed-slot walk-in logic).
    private const OCCUPYING_STATUSES = ['pending_verification', 'confirmed', 'completed'];

    // A day flips from "available" to "limited" once its remaining slot
    // count drops to this many or fewer (and still > 0). Absolute count, not
    // a percentage of the day's total slots — a deliberately simple rule.
    private const LIMITED_THRESHOLD = 3;

    /**
     * Candidate slot start times (HH:MM) still available for a dentist on a
     * given date, for a procedure of the given duration. Empty when the
     * clinic is closed that day (including every Sunday) or every slot is
     * already taken/in the past. Only genuinely bookable start times are
     * ever returned — nothing conflicting or in the past is included for
     * the frontend to render as disabled; there's simply nothing to render.
     */
    public function getAvailableSlots(int $dentistId, string $date, int $durationMinutes): array
    {
        $schedule = $this->operatingHoursFor($dentistId, $date);

        if (! $schedule) {
            return [];
        }

        $candidates = $this->candidateStartTimes($date, $schedule, $durationMinutes);
        $existing = $this->occupiedIntervals($dentistId, $date);

        return array_values(array_filter(
            $candidates,
            fn (Carbon $slot) => ! $this->overlapsAny($slot, $durationMinutes, $existing)
        ));
    }

    /**
     * Day-level availability status for every date from $startDate through
     * $endDate inclusive, for the given dentist + procedure duration — what
     * the booking calendar colors each cell by. Computed from the exact same
     * getAvailableSlots() the time-slot grid uses, so a date's color and its
     * actual slot list can never disagree.
     *
     * Returns ['YYYY-MM-DD' => 'unavailable'|'full'|'limited'|'available'].
     */
    public function getDayAvailabilitySummary(
        int $dentistId,
        string $startDate,
        string $endDate,
        int $durationMinutes
    ): array {
        $summary = [];
        $cursor = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();
        $today = Carbon::today();

        while ($cursor->lte($end)) {
            $dateKey = $cursor->toDateString();

            // Closed day (including every Sunday) or a calendar date that's
            // already fully in the past — nothing to compute, not bookable.
            if ($cursor->lt($today) || ! $this->operatingHoursFor($dentistId, $dateKey)) {
                $summary[$dateKey] = 'unavailable';
            } else {
                $count = count($this->getAvailableSlots($dentistId, $dateKey, $durationMinutes));
                $summary[$dateKey] = match (true) {
                    $count === 0 => 'full',
                    $count <= self::LIMITED_THRESHOLD => 'limited',
                    default => 'available',
                };
            }

            $cursor->addDay();
        }

        return $summary;
    }

    /**
     * Re-check (server-side, never trust the client) that one specific
     * date+time is still free for a dentist before actually booking it —
     * closes the race window between the patient loading the slot grid and
     * submitting. $excludeAppointmentId lets a reschedule ignore the
     * appointment's own current slot when checking for conflicts.
     */
    public function isSlotAvailable(
        int $dentistId,
        string $date,
        string $time,
        int $durationMinutes,
        ?int $excludeAppointmentId = null
    ): bool {
        $schedule = $this->operatingHoursFor($dentistId, $date);

        if (! $schedule) {
            return false;
        }

        $slot = Carbon::parse("{$date} {$time}");
        $lastStart = $this->lastBookableStart($date, $schedule, $durationMinutes);

        if ($slot->lt($schedule['open']) || $slot->gt($lastStart)) {
            return false;
        }

        $existing = $this->occupiedIntervals($dentistId, $date, $excludeAppointmentId);

        return ! $this->overlapsAny($slot, $durationMinutes, $existing);
    }

    /**
     * "My Availability" (dentist_weekly_hours/dentist_day_off) means one
     * dentist can now genuinely have worse hours than another on the same
     * date for the same service — this is the smart doctor-switch
     * suggestion for the booking wizard's Date & Time step: is there
     * another dentist credentialed for the SAME service (never across
     * service boundaries — e.g. never the Pediatric Dentistry account for a
     * general service) who is actually, genuinely better available on this
     * date than the one the patient already picked?
     *
     * Returns null when there's nothing worth suggesting — either the
     * selected dentist isn't meaningfully worse off, or no eligible
     * alternate has real open slots filling the gap. Never triggered by an
     * alternate simply being "less busy" (fully-booked-due-to-demand isn't
     * an hours problem), only by an actual day-off/reduced-weekly-hours gap
     * that another credentialed dentist's real, bookable slots cover.
     */
    public function findSwitchSuggestion(int $selectedDentistId, int $serviceId, string $date, int $durationMinutes): ?array
    {
        $selectedWindow = $this->operatingHoursFor($selectedDentistId, $date);

        $alternates = User::where('role', 'dentist')
            ->where('id', '!=', $selectedDentistId)
            ->whereHas('services', fn ($q) => $q->where('services.id', $serviceId))
            ->get(['id', 'name']);

        $bestAlternate = null;
        $bestWindow = null;
        $bestSlotCount = 0;

        foreach ($alternates as $alternate) {
            $altWindow = $this->operatingHoursFor($alternate->id, $date);
            if (! $altWindow) {
                continue; // Also closed that day — not an improvement.
            }

            $altSlots = $this->getAvailableSlots($alternate->id, $date, $durationMinutes);
            if (empty($altSlots)) {
                continue; // Technically open, but nothing actually bookable — not a real improvement.
            }

            $isImprovement = $selectedWindow === null
                // Selected dentist is fully unavailable — any real slot from
                // a same-service alternate is genuinely better.
                ? true
                // Selected dentist has some hours — only count it if the
                // alternate has an actual bookable slot at/after the exact
                // point the selected dentist closes (fills the real gap,
                // not just "is open later on paper").
                : $altWindow['close']->gt($selectedWindow['close'])
                    && collect($altSlots)->contains(fn (Carbon $s) => $s->gte($selectedWindow['close']));

            if ($isImprovement && count($altSlots) > $bestSlotCount) {
                $bestAlternate = $alternate;
                $bestWindow = $altWindow;
                $bestSlotCount = count($altSlots);
            }
        }

        if (! $bestAlternate) {
            return null;
        }

        // Ghost/disabled slots for the frontend to render across the full
        // gap between the two dentists' hours — e.g. selected closes 13:00,
        // alternate closes 18:00, this spans 09:00-18:00 (bounded by
        // whichever of the two opens earliest/closes latest) so the
        // afternoon slots the selected dentist can't offer still show up as
        // visibly-disabled buttons instead of just vanishing.
        $rangeOpen = $selectedWindow ? $selectedWindow['open']->copy()->min($bestWindow['open']) : $bestWindow['open']->copy();
        $rangeClose = $selectedWindow ? $selectedWindow['close']->copy()->max($bestWindow['close']) : $bestWindow['close']->copy();
        $fullRange = $this->candidateStartTimes($date, ['open' => $rangeOpen, 'close' => $rangeClose], $durationMinutes);

        return [
            'alternate_dentist_id' => $bestAlternate->id,
            'alternate_dentist_name' => $bestAlternate->name,
            'reason' => $selectedWindow === null ? 'unavailable' : 'reduced',
            'unavailable_after' => $selectedWindow === null ? null : $selectedWindow['close']->format('H:i'),
            'full_range_slots' => array_map(fn (Carbon $c) => $c->format('H:i'), $fullRange),
        ];
    }

    /**
     * This dentist's open/close Carbon instances for the given date, or null
     * if they're unavailable that day — a one-off day-off (checked first,
     * wins even on an otherwise-active weekday), their own weekly-hours row
     * marking the day inactive, or no row at all (treated as closed, not as
     * "unrestricted", since an unseeded schedule should never accidentally
     * allow bookings).
     *
     * Falls back to the clinic-wide clinic_schedules default only when this
     * dentist has zero dentist_weekly_hours rows whatsoever — every dentist
     * created going forward should get seeded rows immediately (see the My
     * Availability feature's seed migration), so this fallback is defensive
     * rather than the normal path.
     */
    private function operatingHoursFor(int $dentistId, string $date): ?array
    {
        $dayOfWeek = Carbon::parse($date)->dayOfWeek; // 0=Sunday..6=Saturday, matches clinic_schedules/dentist_weekly_hours

        $dayOff = DB::table('dentist_day_off')
            ->where('dentist_id', $dentistId)
            ->where('date', $date)
            ->exists();

        if ($dayOff) {
            return null;
        }

        $hasCustomHours = DB::table('dentist_weekly_hours')->where('dentist_id', $dentistId)->exists();

        $row = $hasCustomHours
            ? DB::table('dentist_weekly_hours')->where('dentist_id', $dentistId)->where('day_of_week', $dayOfWeek)->first()
            : DB::table('clinic_schedules')->where('day_of_week', $dayOfWeek)->first();

        $isOpen = $hasCustomHours ? ($row->is_active ?? false) : ($row->is_open ?? false);
        $openTime = $hasCustomHours ? ($row->start_time ?? null) : ($row->open_time ?? null);
        $closeTime = $hasCustomHours ? ($row->end_time ?? null) : ($row->close_time ?? null);

        if (! $row || ! $isOpen || ! $openTime || ! $closeTime) {
            return null;
        }

        return [
            'open' => Carbon::parse("{$date} {$openTime}"),
            'close' => Carbon::parse("{$date} {$closeTime}"),
        ];
    }

    /**
     * Slot start times stepped by the procedure's own duration — a 45-min
     * service grids as 9:00, 9:45, 10:30..., not a flat 30-min interval —
     * from opening time through the last bookable start, minus any that
     * have already passed if the date is today.
     */
    private function candidateStartTimes(string $date, array $schedule, int $durationMinutes): array
    {
        $cursor = $schedule['open']->copy();
        $lastStart = $this->lastBookableStart($date, $schedule, $durationMinutes);
        $now = Carbon::now();

        $slots = [];
        while ($cursor->lte($lastStart)) {
            if ($cursor->gt($now)) {
                $slots[] = $cursor->copy();
            }
            $cursor->addMinutes($durationMinutes);
        }

        return $slots;
    }

    /**
     * The later boundary of the two rules a slot start must satisfy: never
     * past the flat 16:30 clinic cutoff, and never so late the procedure
     * would run past closing time. Shared by candidate generation and the
     * server-side re-check so both enforce the identical boundary.
     */
    private function lastBookableStart(string $date, array $schedule, int $durationMinutes): Carbon
    {
        $flatCutoff = Carbon::parse("{$date} ".self::LAST_BOOKING_START);
        $closeBound = $schedule['close']->copy()->subMinutes($durationMinutes);

        return $flatCutoff->min($closeBound);
    }

    /**
     * [start Carbon, end Carbon] pairs for every appointment currently
     * holding a slot on this dentist's calendar that day. lockForUpdate()
     * is a no-op for the plain read-only available-slots GET (its implicit
     * per-statement transaction releases the lock immediately) but gives
     * real protection against a double-booking race when this is called
     * from inside AppointmentController::store()'s explicit DB::transaction.
     */
    private function occupiedIntervals(int $dentistId, string $date, ?int $excludeAppointmentId = null): array
    {
        $query = Appointment::query()
            ->where('dentist_id', $dentistId)
            ->where('appointment_date', $date)
            ->whereIn('status', self::OCCUPYING_STATUSES)
            ->with('service:id,duration_minutes')
            ->lockForUpdate();

        if ($excludeAppointmentId) {
            $query->where('id', '!=', $excludeAppointmentId);
        }

        return $query->get()->map(function (Appointment $appointment) use ($date) {
            $start = Carbon::parse("{$date} {$appointment->appointment_time}");

            return [
                'start' => $start,
                'end' => $start->copy()->addMinutes($appointment->service->duration_minutes),
            ];
        })->all();
    }

    /**
     * True if a candidate [slot, slot+duration) interval overlaps any of the
     * given occupied intervals. Standard interval-overlap test: two ranges
     * overlap unless one ends before the other starts.
     */
    private function overlapsAny(Carbon $slot, int $durationMinutes, array $occupied): bool
    {
        $slotEnd = $slot->copy()->addMinutes($durationMinutes);

        foreach ($occupied as $interval) {
            if ($slot->lt($interval['end']) && $slotEnd->gt($interval['start'])) {
                return true;
            }
        }

        return false;
    }
}
