<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentSlotService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    public function __construct(private AppointmentSlotService $slots) {}

    /**
     * Dynamic time-slot matrix for the booking wizard's calendar step —
     * every slot the chosen dentist is actually free for, sized to the
     * chosen procedure's duration. Sundays (and any date the clinic marks
     * closed) simply come back with an empty slot list rather than an error,
     * so the calendar can grey the day out without a special-case request.
     */
    public function availableSlots(Request $request)
    {
        $validated = $request->validate([
            'dentist_id' => ['required', 'integer', 'exists:users,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
        ]);

        $dentist = $this->findDentist($validated['dentist_id']);

        if (! $dentist) {
            return response()->json(['message' => 'Selected dentist was not found.'], 404);
        }

        $service = Service::findOrFail($validated['service_id']);

        $slots = $this->slots->getAvailableSlots($dentist->id, $validated['date'], $service->duration_minutes);

        // Smart doctor-switch suggestion — only computed (extra queries
        // against the other dentist(s) credentialed for this same service)
        // when relevant; null whenever there's nothing worth suggesting, so
        // the response shape stays the same either way and the frontend
        // simply doesn't render a banner.
        $suggestion = $this->slots->findSwitchSuggestion(
            $dentist->id,
            $service->id,
            $validated['date'],
            $service->duration_minutes,
        );

        return response()->json([
            'data' => [
                'date' => $validated['date'],
                'slots' => array_map(fn ($slot) => $slot->format('H:i'), $slots),
                'suggestion' => $suggestion,
            ],
        ]);
    }

    /**
     * Day-level availability (available/limited/full/unavailable) for every
     * date in the given month — what the booking calendar colors each cell
     * by, so the patient can see at a glance which days are worth opening
     * before picking one and hitting availableSlots() above for the detail.
     */
    public function dayAvailability(Request $request)
    {
        $validated = $request->validate([
            'dentist_id' => ['required', 'integer', 'exists:users,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $dentist = $this->findDentist($validated['dentist_id']);

        if (! $dentist) {
            return response()->json(['message' => 'Selected dentist was not found.'], 404);
        }

        $service = Service::findOrFail($validated['service_id']);

        $start = Carbon::createFromFormat('Y-m-d', "{$validated['month']}-01")->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $summary = $this->slots->getDayAvailabilitySummary(
            $dentist->id,
            $start->toDateString(),
            $end->toDateString(),
            $service->duration_minutes,
        );

        return response()->json(['data' => $summary]);
    }

    private function findDentist(int $dentistId): ?User
    {
        return User::where('id', $dentistId)->where('role', 'dentist')->where('status', 'active')->first();
    }
}
