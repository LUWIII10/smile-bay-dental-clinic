<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ClinicClosure;
use App\Models\ClinicInfo;
use App\Models\ClinicSchedule;
use App\Models\ClinicSpecialHour;
use App\Models\HmoProvider;
use App\Models\Service;
use App\Services\ClinicClosureService;
use App\Services\ClinicSpecialHourService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Admin-only "Settings" — clinic profile, weekly operating hours, the
 * service catalog, and the HMO provider list (which patients pick from
 * during registration — HmoProviderController::index() is the public
 * read-only endpoint that reads the exact same table). Deliberately does
 * not touch anything payment/billing-related, per this project's scope.
 */
class ClinicSettingsController extends Controller
{
    public function __construct(
        private ClinicClosureService $closures,
        private ClinicSpecialHourService $specialHours,
    ) {}

    public function show()
    {
        return response()->json([
            'data' => [
                'clinic_info' => ClinicInfo::firstOrCreate([], ['clinic_name' => 'Smile Bay Dental Clinic']),
                'schedules' => ClinicSchedule::orderBy('day_of_week')->get(),
                'services' => Service::orderBy('category')->orderBy('name')->get(),
                // Every provider, active or not — the admin needs to see
                // (and be able to reactivate) a deactivated one, unlike
                // HmoProviderController::index()'s registration-facing
                // list, which only ever shows the active ones.
                // withCount so Settings.jsx can disable "Remove" per row
                // without a round trip — see destroyHmoProvider()'s own
                // count check, which is the actual source of truth this
                // mirrors.
                'hmo_providers' => HmoProvider::withCount('patients')->orderBy('name')->get(),
                'clinic_closures' => $this->closures->upcoming(),
                'clinic_special_hours' => $this->specialHours->upcoming(),
            ],
        ]);
    }

    public function updateClinicInfo(Request $request)
    {
        $validated = $request->validate([
            'clinic_name' => ['required', 'string', 'max:255'],
            'tagline' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            // Two checks, not one: the character whitelist alone (digits,
            // spaces, +, -, parentheses) only catches letters/stray symbols
            // — "0917 132 3093333333" (padded with extra digits) passed a
            // plain character+length-of-the-whole-string check, since
            // spaces/dashes ate into that length budget without actually
            // limiting how many real digits were typed. Stripping
            // formatting first and counting only the digits catches that:
            // a PH mobile is 11 (09XXXXXXXXX) or 12 with the country code
            // (639XXXXXXXXX) written out, a landline runs 7 (no area code)
            // to 10 (with one) — 7-12 covers all of those without
            // pretending to verify the number is actually real/reachable.
            'contact_number' => [
                'nullable', 'string', 'regex:/^[0-9+\-\s()]+$/',
                function ($attribute, $value, $fail) {
                    if (! $value) {
                        return;
                    }
                    $digitCount = strlen(preg_replace('/\D/', '', $value));
                    if ($digitCount < 7 || $digitCount > 12) {
                        $fail('Please enter a valid phone number — check the number of digits.');
                    }
                },
            ],
            'contact_email' => ['nullable', 'email', 'max:255'],
        ], [
            'contact_number.regex' => 'Please enter a valid phone number (digits, spaces, +, -, and parentheses only).',
        ]);

        $info = ClinicInfo::firstOrCreate([], ['clinic_name' => $validated['clinic_name']]);
        $info->update($validated);

        return response()->json(['data' => $info]);
    }

    /**
     * Bulk-update the 7 day rows in one call — the settings page edits the
     * whole week as a single form, not one day at a time.
     */
    public function updateSchedule(Request $request)
    {
        $validated = $request->validate([
            'days' => ['required', 'array', 'size:7'],
            'days.*.day_of_week' => ['required', 'integer', 'between:0,6', 'distinct'],
            'days.*.is_open' => ['required', 'boolean'],
            'days.*.open_time' => ['required_if:days.*.is_open,true', 'nullable', 'date_format:H:i'],
            'days.*.close_time' => ['required_if:days.*.is_open,true', 'nullable', 'date_format:H:i'],
        ]);

        foreach ($validated['days'] as $day) {
            ClinicSchedule::where('day_of_week', $day['day_of_week'])->update([
                'is_open' => $day['is_open'],
                'open_time' => $day['is_open'] ? $day['open_time'] : null,
                'close_time' => $day['is_open'] ? $day['close_time'] : null,
            ]);
        }

        return response()->json(['data' => ClinicSchedule::orderBy('day_of_week')->get()]);
    }

    public function storeService(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:services,name'],
            'description' => ['nullable', 'string', 'max:1000'],
            'category' => ['nullable', 'string', 'max:100'],
            'duration_minutes' => ['required', 'integer', 'min:5', 'max:480'],
            // Explicit flag — see Service::isPediatric()'s own doc comment
            // for why this is a real column now, not derived from the name.
            'is_pediatric' => ['sometimes', 'boolean'],
            // Defaults to true here (not the column's own migration
            // default of false) — an admin adding a service expects
            // patients to see it immediately; the toggle exists for the
            // rarer staff-only/walk-in-assessment case, not as an
            // extra required step every time.
            'is_patient_bookable' => ['sometimes', 'boolean'],
        ]);

        $service = Service::create([
            ...$validated,
            'is_active' => true,
            'is_pediatric' => $validated['is_pediatric'] ?? false,
            'is_patient_bookable' => $validated['is_patient_bookable'] ?? true,
        ]);

        return response()->json(['data' => $service], 201);
    }

    public function updateService(Request $request, Service $service)
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('services', 'name')->ignore($service->id)],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'category' => ['sometimes', 'nullable', 'string', 'max:100'],
            'duration_minutes' => ['sometimes', 'integer', 'min:5', 'max:480'],
            'is_pediatric' => ['sometimes', 'boolean'],
            'is_patient_bookable' => ['sometimes', 'boolean'],
        ]);

        $service->update($validated);

        return response()->json(['data' => $service->fresh()]);
    }

    /**
     * Toggle a service's visibility to patients — never a hard delete. A
     * service with real appointment history can't be safely removed
     * without orphaning those rows; deactivating just hides it from new
     * bookings (ServiceController::index() already filters is_active).
     */
    public function toggleServiceActive(Service $service)
    {
        $service->update(['is_active' => ! $service->is_active]);

        return response()->json(['data' => $service->fresh()]);
    }

    public function storeHmoProvider(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:hmo_providers,name'],
            // Optional — Medicard/Flexicare's own logos predate this column
            // and stay hardcoded frontend assets; this is only for a
            // provider an admin adds from here on. Same image rules as
            // ProfileController::uploadAvatar().
            'logo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $logoPath = $this->storeLogo($request);

        $provider = HmoProvider::create([
            'name' => $validated['name'],
            'logo_path' => $logoPath,
            'is_active' => true,
        ]);

        return response()->json(['data' => $provider], 201);
    }

    public function updateHmoProvider(Request $request, HmoProvider $hmoProvider)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('hmo_providers', 'name')->ignore($hmoProvider->id)],
            'logo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'remove_logo' => ['sometimes', 'boolean'],
        ]);

        $update = ['name' => $validated['name']];

        if ($request->hasFile('logo')) {
            $this->deleteLogoIfLocal($hmoProvider->logo_path);
            $update['logo_path'] = $this->storeLogo($request);
        } elseif ($request->boolean('remove_logo')) {
            // Clears back to the initials badge (Settings.jsx's own
            // hmo-logo-picker-preview--empty) — a new upload always takes
            // priority over this if somehow both were sent, hence the elseif.
            $this->deleteLogoIfLocal($hmoProvider->logo_path);
            $update['logo_path'] = null;
        }

        $hmoProvider->update($update);

        return response()->json(['data' => $hmoProvider->fresh()]);
    }

    private function storeLogo(Request $request): ?string
    {
        if (! $request->hasFile('logo')) {
            return null;
        }

        $path = $request->file('logo')->store('hmo-logos', 'public');

        // Site-relative — see ProfileController::uploadAvatar()'s comment
        // for why this isn't Storage::disk('public')->url($path).
        return '/storage/'.$path;
    }

    // Same local-only-delete guard as ProfileController::deleteIfLocal() —
    // never touches a value that isn't one of our own uploaded files (there
    // is none today for hmo_providers, but this keeps the two upload
    // features consistent instead of drifting apart later).
    private function deleteLogoIfLocal(?string $url): void
    {
        if (! $url) {
            return;
        }

        if (str_contains($url, '/storage/hmo-logos/')) {
            Storage::disk('public')->delete('hmo-logos/'.basename($url));
        }
    }

    /**
     * Same never-hard-delete reasoning as toggleServiceActive() — patients
     * who already registered with this provider (patients.hmo_provider_id)
     * keep their existing record either way; deactivating just removes it
     * from the registration wizard's dropdown for anyone signing up after
     * (HmoProviderController::index() already filters is_active).
     */
    public function toggleHmoProviderActive(HmoProvider $hmoProvider)
    {
        $hmoProvider->update(['is_active' => ! $hmoProvider->is_active]);

        return response()->json(['data' => $hmoProvider->fresh()]);
    }

    /**
     * A true hard delete — unlike toggleHmoProviderActive() above, this
     * actually removes the row and its logo file. Only safe to expose when
     * nothing references it: patients.hmo_provider_id is nullOnDelete(), so
     * an unguarded delete here would silently blank out which provider an
     * existing HMO patient registered under. Blocked with a 409 (not a
     * validation error — nothing about the request itself is invalid) the
     * moment at least one patient is linked; the frontend then points the
     * admin at Deactivate instead, same as a provider that's still in use
     * has always had to do.
     */
    public function destroyHmoProvider(HmoProvider $hmoProvider)
    {
        $patientCount = $hmoProvider->patients()->count();

        if ($patientCount > 0) {
            return response()->json([
                'message' => "Can't remove {$hmoProvider->name} — {$patientCount} ".
                    ($patientCount === 1 ? 'patient is' : 'patients are').
                    ' still registered under it. Deactivate it instead.',
                'patient_count' => $patientCount,
            ], 409);
        }

        $this->deleteLogoIfLocal($hmoProvider->logo_path);
        $hmoProvider->delete();

        return response()->json(['data' => HmoProvider::orderBy('name')->get()]);
    }

    /**
     * Deliberately stricter than updateSchedule()/storeDayOff()'s own
     * "flags conflicts, confirm=true to force" pattern — a clinic-wide
     * closure is never force-created over existing appointments. Every
     * conflict must be individually rescheduled first (the frontend reuses
     * StaffAppointmentController::reschedule() for that, row by row), and
     * this keeps getting re-called — by "Add Closure" the first time, then
     * by "Close Clinic" again once the list is empty — until the conflict
     * list genuinely comes back empty, at which point it actually creates
     * the row. No confirm flag to bypass that; nothing else in this method
     * does the overriding.
     */
    public function storeClosure(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $alreadyExists = ClinicClosure::where('date', $validated['date'])->exists();
        if ($alreadyExists) {
            return response()->json(['message' => 'That date is already marked as closed.'], 422);
        }

        $conflicts = $this->closures->conflictsForClosure($validated['date']);

        if ($conflicts->isNotEmpty()) {
            return response()->json([
                'conflicts' => true,
                'conflicting_appointments' => $this->closures->formatConflicts($conflicts),
            ]);
        }

        $this->closures->store($validated['date'], $validated['reason'] ?? null);

        return response()->json(['conflicts' => false, 'closures' => $this->closures->upcoming()], 201);
    }

    /**
     * Read-only re-check of a date's conflicts — used to refresh the
     * "Reschedule affected patients first" list after each individual
     * reschedule, without re-triggering storeClosure()'s own create-when-
     * empty side effect (that only happens when the admin explicitly clicks
     * "Close Clinic" again).
     */
    public function closureConflicts(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $conflicts = $this->closures->conflictsForClosure($validated['date']);

        return response()->json(['data' => $this->closures->formatConflicts($conflicts)]);
    }

    /**
     * No conflict check needed — removing a closure only ever expands
     * availability, same reasoning as DentistAvailabilityController::
     * destroyDayOff().
     */
    public function destroyClosure(ClinicClosure $closure)
    {
        $closure->delete();

        return response()->json(['data' => $this->closures->upcoming()]);
    }

    public function closureDaySummary(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'date_format:Y-m'],
        ]);

        return response()->json(['data' => $this->closures->daySummary($validated['month'])]);
    }

    /**
     * Opens one specific date outside the regular weekly Operating Hours
     * (e.g. a single extra Sunday) — the inverse of storeClosure() above.
     * No conflict check needed: opening a date can never strand an
     * existing appointment, only closing one can. Doesn't make any dentist
     * bookable by itself — see AppointmentSlotService::operatingHoursFor()
     * and DentistAvailabilityController::storeSpecialWorkingDay() for the
     * per-dentist opt-in this still requires.
     */
    public function storeSpecialHour(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'open_time' => ['required', 'date_format:H:i'],
            'close_time' => ['required', 'date_format:H:i', 'after:open_time'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $alreadyExists = ClinicSpecialHour::where('date', $validated['date'])->exists();
        if ($alreadyExists) {
            return response()->json(['message' => 'That date already has a special opening.'], 422);
        }

        $this->specialHours->store(
            $validated['date'],
            $validated['open_time'],
            $validated['close_time'],
            $validated['reason'] ?? null,
        );

        return response()->json(['data' => $this->specialHours->upcoming()], 201);
    }

    /**
     * No conflict check needed — removing a special opening only ever
     * narrows availability, same reasoning as destroyClosure() above.
     * Cascades nowhere: any dentist_special_hours row for this date is
     * left in place but becomes inert (operatingHoursFor() checks
     * clinic_special_hours first and finds nothing), same as a dentist's
     * own weekly hours for a day the clinic closes outright.
     */
    public function destroySpecialHour(ClinicSpecialHour $specialHour)
    {
        $specialHour->delete();

        return response()->json(['data' => $this->specialHours->upcoming()]);
    }
}
