<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DentistProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * "My Profile" — every role's own account view/edit. One controller for all
 * four roles rather than per-role duplicates: the editable field set just
 * grows depending on $user->role, all scoped to the authenticated user
 * (never a route/body-supplied user id), so nobody can edit anyone else's
 * account through this surface.
 */
class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json([
            'data' => $request->user()->load(['patient.hmoProvider', 'dentistProfile']),
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $rules = [
            'name' => ['sometimes', 'string', 'max:255'],
            'mobile_number' => [
                'sometimes', 'string', 'regex:/^(09\d{9}|\+639\d{9})$/',
                Rule::unique('users', 'mobile_number')->ignore($user->id),
            ],
        ];

        if ($user->role === 'patient') {
            $rules = [...$rules,
                'first_name' => ['sometimes', 'string', 'max:100'],
                'middle_name' => ['sometimes', 'nullable', 'string', 'max:100'],
                'last_name' => ['sometimes', 'string', 'max:100'],
                'complete_address' => ['sometimes', 'string', 'max:500'],
                'emergency_contact_name' => ['sometimes', 'string', 'max:255'],
                'emergency_contact_relationship' => ['sometimes', 'string', 'max:100'],
                'emergency_contact_number' => ['sometimes', 'string', 'regex:/^[0-9+\-\s]{7,20}$/'],
                'allergies' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'current_medications' => ['sometimes', 'nullable', 'string', 'max:1000'],
                'medical_conditions_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
                // Patients can switch Cash <-> HMO coverage any time from
                // their own profile (e.g. they just got HMO coverage, or
                // dropped it) — mirrors RegisterRequest's own rule shapes
                // exactly, including the "only active providers selectable"
                // constraint. Only ever affects future bookings:
                // Appointment::patient_type_snapshot is captured at booking
                // time (AppointmentController::store()), so past
                // appointments never retroactively change.
                'patient_type' => ['sometimes', 'in:cash,hmo'],
                'hmo_provider_id' => [
                    'nullable', 'integer', 'required_if:patient_type,hmo',
                    Rule::exists('hmo_providers', 'id')->where('is_active', true),
                ],
                'hmo_number' => ['nullable', 'string', 'max:100', 'required_if:patient_type,hmo'],
                'hmo_company_name' => ['nullable', 'string', 'max:255', 'required_if:patient_type,hmo'],
            ];
            // Name is derived from the structured patient fields below, not
            // edited directly — dropping it here means it's silently ignored
            // instead of drifting out of sync with first/middle/last_name.
            unset($rules['name']);
        }

        if ($user->role === 'dentist') {
            $rules = [...$rules,
                'specialization' => ['sometimes', 'nullable', 'string', 'max:255'],
                'bio' => ['sometimes', 'nullable', 'string', 'max:2000'],
                'years_experience' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:80'],
            ];
        }

        $validated = $request->validate($rules);

        DB::transaction(function () use ($user, $validated) {
            $user->update(array_intersect_key($validated, array_flip(['name', 'mobile_number'])));

            if ($user->role === 'patient' && $user->patient) {
                $patientFields = [
                    'first_name', 'middle_name', 'last_name', 'emergency_contact_name',
                    'emergency_contact_relationship', 'emergency_contact_number', 'allergies', 'current_medications',
                ];
                $patientData = array_intersect_key($validated, array_flip($patientFields));

                if (array_key_exists('complete_address', $validated)) {
                    $patientData['address_line'] = $validated['complete_address'];
                }
                if (array_key_exists('medical_conditions_notes', $validated)) {
                    $patientData['medical_conditions_other'] = $validated['medical_conditions_notes'];
                }

                // Same null-out-the-other-side rule as AuthController::register()
                // — switching to cash clears any old HMO details rather than
                // leaving a stale provider/card number sitting on the record.
                if (array_key_exists('patient_type', $validated)) {
                    $patientData['patient_type'] = $validated['patient_type'];
                    $patientData['hmo_provider_id'] = $validated['patient_type'] === 'hmo' ? $validated['hmo_provider_id'] : null;
                    $patientData['hmo_number'] = $validated['patient_type'] === 'hmo' ? $validated['hmo_number'] : null;
                    $patientData['hmo_company_name'] = $validated['patient_type'] === 'hmo' ? $validated['hmo_company_name'] : null;
                }

                if ($patientData) {
                    $user->patient->update($patientData);
                }

                // users.name is derived from the patient's structured name —
                // keep it in sync whenever any name part changed.
                if (array_intersect(['first_name', 'middle_name', 'last_name'], array_keys($validated))) {
                    $patient = $user->patient->fresh();
                    $fullName = trim(preg_replace(
                        '/\s+/', ' ',
                        $patient->first_name.' '.($patient->middle_name ?? '').' '.$patient->last_name
                    ));
                    $user->update(['name' => $fullName]);
                }
            }

            if ($user->role === 'dentist') {
                $profileData = array_intersect_key($validated, array_flip(['specialization', 'bio', 'years_experience']));
                if ($profileData) {
                    DentistProfile::updateOrCreate(['user_id' => $user->id], $profileData);
                }
            }
        });

        return response()->json([
            'data' => $user->fresh()->load(['patient.hmoProvider', 'dentistProfile']),
        ]);
    }

    public function changePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => [
                'required', 'string', 'min:8', 'confirmed',
                'regex:/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/',
            ],
        ], [
            'password.confirmed' => 'Password confirmation does not match.',
            'password.regex' => 'Password must include an uppercase letter, a number, and a special character.',
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'Current password is incorrect.',
                'errors' => ['current_password' => ['Current password is incorrect.']],
            ], 422);
        }

        $user->forceFill(['password' => Hash::make($validated['password'])])->save();

        return response()->json(['message' => 'Password changed successfully.']);
    }

    /**
     * Profile picture, all four roles. Dentists write through to
     * dentist_profiles.photo_path (the column already rendered on the
     * public booking/appointment screens) instead of a separate users
     * column, so a dentist uploading their own photo here is what patients
     * see when picking a dentist — not two photos that can drift apart.
     */
    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $user = $request->user();
        $oldUrl = $this->currentAvatarUrl($user);

        $path = $request->file('avatar')->store('avatars', 'public');
        $url = Storage::disk('public')->url($path);

        $this->setAvatarUrl($user, $url);
        $this->deleteIfLocal($oldUrl);

        return response()->json([
            'data' => $user->fresh()->load(['patient.hmoProvider', 'dentistProfile']),
        ]);
    }

    public function removeAvatar(Request $request)
    {
        $user = $request->user();
        $oldUrl = $this->currentAvatarUrl($user);

        $this->setAvatarUrl($user, null);
        $this->deleteIfLocal($oldUrl);

        return response()->json([
            'data' => $user->fresh()->load(['patient.hmoProvider', 'dentistProfile']),
        ]);
    }

    private function currentAvatarUrl($user): ?string
    {
        return $user->role === 'dentist'
            ? $user->dentistProfile?->photo_path
            : $user->avatar_path;
    }

    private function setAvatarUrl($user, ?string $url): void
    {
        if ($user->role === 'dentist') {
            DentistProfile::updateOrCreate(['user_id' => $user->id], ['photo_path' => $url]);
        } else {
            $user->update(['avatar_path' => $url]);
        }
    }

    // Only ever deletes files this endpoint itself stored under
    // storage/app/public/avatars — the pediatric dentist's seeded Unsplash
    // URL (and any other external URL) is left alone since it isn't ours
    // to delete and Storage::disk('public')->delete() would just no-op
    // on a path that was never a real local file anyway, but skipping it
    // outright is clearer about why.
    private function deleteIfLocal(?string $url): void
    {
        if (! $url) {
            return;
        }

        $prefix = Storage::disk('public')->url('avatars/');
        if (str_starts_with($url, $prefix)) {
            Storage::disk('public')->delete('avatars/'.basename($url));
        }
    }
}
