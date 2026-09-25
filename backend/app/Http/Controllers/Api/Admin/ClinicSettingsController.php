<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\ClinicInfo;
use App\Models\ClinicSchedule;
use App\Models\HmoProvider;
use App\Models\Service;
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
                'hmo_providers' => HmoProvider::orderBy('name')->get(),
            ],
        ]);
    }

    public function updateClinicInfo(Request $request)
    {
        $validated = $request->validate([
            'clinic_name' => ['required', 'string', 'max:255'],
            'tagline' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:500'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'contact_email' => ['nullable', 'email', 'max:255'],
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
        ]);

        $service = Service::create([...$validated, 'is_active' => true, 'is_pediatric' => $validated['is_pediatric'] ?? false]);

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
        ]);

        $update = ['name' => $validated['name']];

        if ($request->hasFile('logo')) {
            $this->deleteLogoIfLocal($hmoProvider->logo_path);
            $update['logo_path'] = $this->storeLogo($request);
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

        return Storage::disk('public')->url($path);
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

        $prefix = Storage::disk('public')->url('hmo-logos/');
        if (str_starts_with($url, $prefix)) {
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
}
