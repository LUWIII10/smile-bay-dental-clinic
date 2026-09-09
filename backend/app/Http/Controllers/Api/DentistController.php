<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\User;
use Illuminate\Http\Request;

class DentistController extends Controller
{
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
            ]);

        return response()->json(['data' => $dentists]);
    }
}
