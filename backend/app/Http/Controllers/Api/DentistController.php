<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentSlotService;
use Illuminate\Http\Request;

class DentistController extends Controller
{
    public function __construct(private AppointmentSlotService $slots) {}

    /**
     * List active dentists for the booking wizard's doctor-selection step.
     * Open selection within whatever `service_id` allows — every active
     * dentist credentialed for that service is returned (no auto-suggestion
     * or history matching). Without service_id, every active dentist comes
     * back (unfiltered), same as before this pass.
     *
     * service_id filtering exists because clinic operations require it: the
     * pediatric dentist is the ONLY one credentialed for the pediatric
     * service, and the two general dentists are credentialed for
     * everything else (see dentist_services / PediatricDentistSeeder) — a
     * patient booking a standard procedure should never see the pediatric
     * dentist offered as an option, and vice versa.
     *
     * Left-joins dentist_profiles (via the relation) so a dentist without a
     * filled-out profile yet still appears, just with null
     * specialization/bio/photo rather than being hidden.
     */
    public function index(Request $request)
    {
        $validated = $request->validate([
            'service_id' => ['nullable', 'integer', 'exists:services,id'],
        ]);

        $query = User::where('role', 'dentist')->where('status', 'active')->with('dentistProfile');

        if (! empty($validated['service_id'])) {
            $service = Service::findOrFail($validated['service_id']);
            $query->whereHas('services', fn ($q) => $q->where('services.id', $service->id));
        }

        $today = now()->toDateString();

        $dentists = $query->orderBy('name')
            ->get()
            ->map(fn (User $dentist) => [
                'id' => $dentist->id,
                'name' => $dentist->name,
                'specialization' => $dentist->dentistProfile?->specialization,
                'bio' => $dentist->dentistProfile?->bio,
                // Named photo_path (not avatar_url) — matches the column
                // already on dentist_profiles and what the frontend already
                // consumes; not renamed to avoid a breaking field-name change.
                'photo_path' => $dentist->dentistProfile?->photo_path,
                'years_experience' => $dentist->dentistProfile?->years_experience,
                // Informational only, scoped to TODAY specifically (the one
                // date this step can honestly know before the patient picks
                // one) — see AppointmentSlotService::isDentistOnDuty(). The
                // frontend shows this as a hint on the card, never disables
                // it: a dentist off today may still be exactly who the
                // patient should pick for a future date.
                'on_duty_today' => $this->slots->isDentistOnDuty($dentist->id, $today),
            ]);

        return response()->json(['data' => $dentists]);
    }
}
