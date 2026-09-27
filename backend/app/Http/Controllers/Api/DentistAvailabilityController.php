<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DentistDayOff;
use App\Services\DentistAvailabilityService;
use Illuminate\Http\Request;

/**
 * "My Availability" — a dentist's own weekly hours + day-offs. Every method
 * scopes to $request->user()->id (never a route/body-supplied dentist id),
 * so a dentist can only ever see/change their own schedule.
 */
class DentistAvailabilityController extends Controller
{
    private const DAY_NAMES = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday'];

    public function __construct(private DentistAvailabilityService $availability) {}

    public function index(Request $request)
    {
        $data = $this->availability->forDentist($request->user()->id);
        // Lets the frontend explain that the toggle grid below is
        // informational for this dentist — see AppointmentSlotService::
        // operatingHoursFor()'s is_on_call bypass.
        $data['is_on_call'] = (bool) $request->user()->dentistProfile?->is_on_call;

        return response()->json(['data' => $data]);
    }

    /**
     * Saves Monday-Saturday's hours. If the new hours would exclude a time
     * that has an existing confirmed/pending appointment, nothing is saved
     * on the first call — the response flags the conflicts instead so the
     * frontend can show them and ask the dentist to explicitly confirm
     * ("Save anyway"), which resubmits with confirm=true.
     */
    public function updateWeeklyHours(Request $request)
    {
        $validated = $request->validate([
            'hours' => ['required', 'array', 'size:6'],
            'hours.*.day_of_week' => ['required', 'integer', 'between:1,6'],
            'hours.*.is_active' => ['required', 'boolean'],
            'hours.*.start_time' => ['nullable', 'date_format:H:i'],
            'hours.*.end_time' => ['nullable', 'date_format:H:i'],
            'confirm' => ['sometimes', 'boolean'],
        ]);

        $days = collect($validated['hours'])->pluck('day_of_week')->sort()->values()->all();
        if ($days !== [1, 2, 3, 4, 5, 6]) {
            return response()->json(['message' => 'Hours must be provided for Monday through Saturday, exactly once each.'], 422);
        }

        foreach ($validated['hours'] as $row) {
            if (! $row['is_active']) {
                continue;
            }

            if (! $row['start_time'] || ! $row['end_time']) {
                return response()->json(['message' => self::DAY_NAMES[$row['day_of_week']].' needs both a start and end time, or should be marked not working.'], 422);
            }

            if ($row['start_time'] >= $row['end_time']) {
                return response()->json(['message' => 'On '.self::DAY_NAMES[$row['day_of_week']].', end time must be after start time.'], 422);
            }
        }

        $dentistId = $request->user()->id;
        $conflicts = $this->availability->conflictsForWeeklyHours($dentistId, $validated['hours']);

        if ($conflicts->isNotEmpty() && ! ($validated['confirm'] ?? false)) {
            return response()->json([
                'conflicts' => true,
                'conflicting_appointments' => $this->availability->formatConflicts($conflicts),
            ]);
        }

        $this->availability->saveWeeklyHours($dentistId, $validated['hours']);

        return response()->json(['conflicts' => false, 'data' => $this->availability->forDentist($dentistId)]);
    }

    /**
     * Same first-call-flags-conflicts / confirm=true-to-force pattern as
     * updateWeeklyHours above — a day-off can just as easily strand an
     * existing appointment as a shrunk weekly-hours window can.
     */
    public function storeDayOff(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'confirm' => ['sometimes', 'boolean'],
        ]);

        $dentistId = $request->user()->id;

        $alreadyExists = DentistDayOff::where('dentist_id', $dentistId)->where('date', $validated['date'])->exists();
        if ($alreadyExists) {
            return response()->json(['message' => 'That date is already marked as a day off.'], 422);
        }

        $conflicts = $this->availability->conflictsForDayOff($dentistId, $validated['date']);

        if ($conflicts->isNotEmpty() && ! ($validated['confirm'] ?? false)) {
            return response()->json([
                'conflicts' => true,
                'conflicting_appointments' => $this->availability->formatConflicts($conflicts),
            ]);
        }

        $this->availability->addDayOff($dentistId, $validated['date'], $validated['reason'] ?? null);

        return response()->json(['conflicts' => false, 'data' => $this->availability->forDentist($dentistId)], 201);
    }

    /**
     * No conflict check needed — removing a day-off only ever expands
     * availability, it can never strand an existing appointment.
     */
    public function destroyDayOff(Request $request, int $id)
    {
        $dayOff = DentistDayOff::find($id);

        if (! $dayOff || $dayOff->dentist_id !== $request->user()->id) {
            return response()->json(['message' => 'Day off not found.'], 404);
        }

        $dayOff->delete();

        return response()->json(['data' => $this->availability->forDentist($request->user()->id)]);
    }
}
