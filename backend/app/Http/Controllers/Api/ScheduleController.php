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
     *
     * dentist_id is now optional — omitted entirely means "Any Available
     * Doctor" (BookAppointment.jsx's special doctor-step card): the union of
     * every credentialed dentist's slots, display only. Which specific
     * dentist a chosen time actually resolves to is a separate question —
     * see resolveDentist() below — never assumed from this union.
     */
    public function availableSlots(Request $request)
    {
        $validated = $request->validate([
            'dentist_id' => ['nullable', 'integer', 'exists:users,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
        ]);

        $service = Service::findOrFail($validated['service_id']);

        if (empty($validated['dentist_id'])) {
            $slots = $this->slots->getAvailableSlotsAnyDentist($service->id, $validated['date'], $service->duration_minutes);

            return response()->json([
                'data' => [
                    'date' => $validated['date'],
                    'slots' => array_map(fn ($slot) => $slot->format('H:i'), $slots),
                    // The doctor-switch suggestion is a "your selected
                    // dentist specifically has worse hours" comparison —
                    // meaningless when there's no selected dentist to
                    // compare from.
                    'suggestion' => null,
                ],
            ]);
        }

        $dentist = $this->findDentist($validated['dentist_id']);

        if (! $dentist) {
            return response()->json(['message' => 'Selected dentist was not found.'], 404);
        }

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
     * dentist_id optional the same way as availableSlots() above — omitted
     * means the "Any Available Doctor" union.
     */
    public function dayAvailability(Request $request)
    {
        $validated = $request->validate([
            'dentist_id' => ['nullable', 'integer', 'exists:users,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'month' => ['required', 'date_format:Y-m'],
        ]);

        $service = Service::findOrFail($validated['service_id']);

        $start = Carbon::createFromFormat('Y-m-d', "{$validated['month']}-01")->startOfMonth();
        $end = $start->copy()->endOfMonth();

        if (empty($validated['dentist_id'])) {
            $summary = $this->slots->getDayAvailabilitySummaryAnyDentist(
                $service->id,
                $start->toDateString(),
                $end->toDateString(),
                $service->duration_minutes,
            );

            return response()->json(['data' => $summary]);
        }

        $dentist = $this->findDentist($validated['dentist_id']);

        if (! $dentist) {
            return response()->json(['message' => 'Selected dentist was not found.'], 404);
        }

        $summary = $this->slots->getDayAvailabilitySummary(
            $dentist->id,
            $start->toDateString(),
            $end->toDateString(),
            $service->duration_minutes,
        );

        return response()->json(['data' => $summary]);
    }

    /**
     * "Any Available Doctor" resolution — called once the patient picks a
     * specific time slot while no dentist was pre-selected: decides, and
     * hands back, exactly who they got (AppointmentSlotService::
     * resolveDentistForSlot()'s load-balancing tie-break), so the rest of
     * the wizard (Payment/Summary/Confirm) proceeds completely unchanged,
     * as an ordinary single-dentist booking. 404 means the slot grid the
     * patient saw went stale (another booking landed there since) — the
     * frontend sends them back to pick another time, same as any other
     * stale-slot recovery in this app.
     */
    public function resolveDentist(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'time' => ['required', 'date_format:H:i'],
        ]);

        $service = Service::findOrFail($validated['service_id']);

        $dentist = $this->slots->resolveDentistForSlot(
            $service->id,
            $validated['date'],
            $validated['time'],
            $service->duration_minutes,
        );

        if (! $dentist) {
            return response()->json([
                'message' => 'That time is no longer available with any doctor. Please choose another.',
            ], 409);
        }

        $dentist->load('dentistProfile');

        return response()->json(['data' => [
            'id' => $dentist->id,
            'name' => $dentist->name,
            'specialization' => $dentist->dentistProfile?->specialization,
            'bio' => $dentist->dentistProfile?->bio,
            'photo_path' => $dentist->dentistProfile?->photo_path,
        ]]);
    }

    private function findDentist(int $dentistId): ?User
    {
        return User::where('id', $dentistId)->where('role', 'dentist')->where('status', 'active')->first();
    }
}
