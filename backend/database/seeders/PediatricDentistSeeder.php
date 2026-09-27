<?php

namespace Database\Seeders;

use App\Models\DentistProfile;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class PediatricDentistSeeder extends Seeder
{
    // Both accounts created/touched by this seeder share this placeholder —
    // CHANGE before any real demo or production use.
    private const PLACEHOLDER_PASSWORD = 'ChangeMe123!';

    public function run(): void
    {
        // --- Dr. Rizael Castro ---------------------------------------------
        // Not a placeholder — same bio already published on the landing
        // page's "Meet Our Dentists" section. Created here because no real
        // login account existed for Castro (only Ramirez, id 16, did).
        // Without one, "link Ramirez and Castro to every non-pediatric
        // service" has nothing real to link Castro to, and the new
        // service-filtered doctor step would only ever show Ramirez for
        // standard procedures instead of both general dentists.
        $castro = User::updateOrCreate(
            ['email' => 'castro@smilebaydental.com'],
            [
                'name' => 'Dr. Rizael Castro',
                'password' => Hash::make(self::PLACEHOLDER_PASSWORD),
                'role' => 'dentist',
                'status' => 'active',
            ]
        );
        $castro->forceFill(['email_verified_at' => now()])->save();

        DentistProfile::updateOrCreate(
            ['user_id' => $castro->id],
            [
                'specialization' => 'General Dentistry, Orthodontics, Endodontics, Cosmetic Dentistry',
                'bio' => 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since December 2013.',
                'years_experience' => now()->year - 2013,
            ]
        );

        $ramirez = User::where('role', 'dentist')->where('name', 'Dr. Richelle Ramirez')->first();

        // --- Dr. Suchelle Ann del Castillo-Pascual, DMD (Pediatric and
        // Special Needs Dentistry) — real details as of 2026-09-25.
        // photo_path isn't set here, same as Castro's own entry above: her
        // real photo is a local storage/app/public/avatars/ file (cropped
        // to a face-framed square from the full-length photo the clinic
        // gave, since this account's photo renders as a 120x120 circular
        // headshot everywhere it's used) — a real upload, not something a
        // fresh-environment seed run can reproduce, so it's set directly on
        // the row rather than hardcoded to a path that may not exist yet.
        $pediatric = User::updateOrCreate(
            ['email' => 'pediatric@smilebaydental.com'],
            [
                'name' => 'Dr. Suchelle Ann del Castillo-Pascual, DMD',
                'password' => Hash::make(self::PLACEHOLDER_PASSWORD),
                'role' => 'dentist',
                'status' => 'active',
            ]
        );
        $pediatric->forceFill(['email_verified_at' => now()])->save();

        DentistProfile::updateOrCreate(
            ['user_id' => $pediatric->id],
            [
                'specialization' => 'Pediatric and Special Needs Dentistry',
                'bio' => 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since June 2014.',
                'years_experience' => now()->year - 2014,
                // No fixed weekly schedule — see
                // AppointmentSlotService::operatingHoursFor()'s is_on_call
                // branch, which bypasses her own dentist_weekly_hours toggle
                // entirely so patients can still request any clinic-open day.
                'is_on_call' => true,
            ]
        );

        // --- Credential each dentist for what they may actually perform -----
        $pediatricService = Service::where('name', 'like', '%Pediatric%')->firstOrFail();
        $otherServiceIds = Service::where('id', '!=', $pediatricService->id)->pluck('id');

        $castro->services()->syncWithoutDetaching($otherServiceIds);
        if ($ramirez) {
            $ramirez->services()->syncWithoutDetaching($otherServiceIds);
        }
        // sync (not syncWithoutDetaching) — the pediatric account should
        // never end up credentialed for anything but the pediatric service.
        $pediatric->services()->sync([$pediatricService->id]);
    }
}
