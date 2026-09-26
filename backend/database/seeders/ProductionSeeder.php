<?php

namespace Database\Seeders;

use App\Models\ClinicSchedule;
use App\Models\DentistProfile;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * Run by the Docker start script on every deploy (`db:seed --class=
 * ProductionSeeder --force`), not just the first one — every write here is
 * firstOrCreate/insertOrIgnore-based, so re-running against an
 * already-seeded database is a safe no-op. Exists so a fresh Railway
 * database has one real login per staff role, plus the two general
 * dentists already on the landing page, without ever putting a password in
 * git: each SEED_*_PASSWORD is read from a Railway environment variable,
 * and a role is skipped (with a warning, not an error) if its variable
 * isn't set.
 */
class ProductionSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(ServiceSeeder::class);

        // ServiceSeeder doesn't set is_pediatric (that column's backfill
        // lives in the 2026_09_09 migration, which runs against an EMPTY
        // services table on a fresh database — migrate always runs before
        // any seeder). Re-applying the same backfill here, after the rows
        // actually exist, is what makes the pediatric service's own
        // is_pediatric flag come out true on a from-scratch deploy instead
        // of silently staying at the column's false default.
        DB::table('services')->where('name', 'like', '%Pediatric%')->update(['is_pediatric' => true]);

        $this->seedClinicScheduleIfEmpty();

        $this->firstOrCreateStaff(
            env('SEED_ADMIN_EMAIL', 'admin@smilebaydental.com'),
            env('SEED_ADMIN_NAME', 'Smile Bay Admin'),
            'admin',
            env('SEED_ADMIN_PASSWORD')
        );

        $this->firstOrCreateStaff(
            env('SEED_ASSISTANT_EMAIL', 'frontdesk@smilebaydental.com'),
            env('SEED_ASSISTANT_NAME', 'Smile Bay Front Desk'),
            'dental_assistant',
            env('SEED_ASSISTANT_PASSWORD')
        );

        $dentistPassword = env('SEED_DENTIST_PASSWORD');

        $ramirez = $this->firstOrCreateStaff('ramirez@smilebaydental.com', 'Dr. Richelle Ramirez', 'dentist', $dentistPassword);
        if ($ramirez) {
            DentistProfile::firstOrCreate(
                ['user_id' => $ramirez->id],
                [
                    'specialization' => 'General Dentistry, Orthodontics, Cosmetic Dentistry, Restorative Dentistry',
                    'bio' => 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since June 2014.',
                    'years_experience' => now()->year - 2014,
                ]
            );
        }

        // castro@smilebaydental.com / PediatricDentistSeeder's own
        // ChangeMe123! placeholder may already have created this exact
        // account — firstOrCreate below just finds it and moves on, no
        // duplicate, no password overwritten.
        $castro = $this->firstOrCreateStaff('castro@smilebaydental.com', 'Dr. Rizael Castro', 'dentist', $dentistPassword);
        if ($castro) {
            DentistProfile::firstOrCreate(
                ['user_id' => $castro->id],
                [
                    'specialization' => 'General Dentistry, Orthodontics, Endodontics, Cosmetic Dentistry',
                    'bio' => 'Doctor of Dental Medicine, University of the Philippines - Manila. Licensed to practice since December 2013.',
                    'years_experience' => now()->year - 2013,
                ]
            );
        }

        // Credential both general dentists for every non-pediatric service —
        // same rule PediatricDentistSeeder already applies for Castro.
        $pediatricService = Service::where('is_pediatric', true)->first();
        if ($pediatricService) {
            $nonPediatricServiceIds = Service::where('id', '!=', $pediatricService->id)->pluck('id');
            $ramirez?->services()->syncWithoutDetaching($nonPediatricServiceIds);
            $castro?->services()->syncWithoutDetaching($nonPediatricServiceIds);
        }

        // The pediatric dentist account (pediatric@smilebaydental.com) isn't
        // one of the three roles above — ServiceSeeder + the two general
        // dentists alone leave the pediatric service with zero credentialed
        // dentists, so the booking wizard's "Choose a Doctor" step comes up
        // empty for it. PediatricDentistSeeder creates her account and does
        // its own service-crediting; it looks up Ramirez by name and
        // null-safely skips that part if she isn't there, so calling this
        // unconditionally (after the block above, where she's created) is
        // safe even on a deploy with no SEED_DENTIST_PASSWORD set.
        $this->call(PediatricDentistSeeder::class);

        // PediatricDentistSeeder's own User::updateOrCreate() unconditionally
        // overwrites 'password' on every run (unlike firstOrCreate, it
        // re-applies the given attributes even on an existing match) — so
        // Castro, who the block above just gave the real SEED_DENTIST_PASSWORD,
        // silently gets reset back to that seeder's own ChangeMe123!
        // placeholder every single deploy. Re-asserting the real password
        // here, after PediatricDentistSeeder runs, is what makes it stick.
        if ($castro && $dentistPassword) {
            $castro->forceFill(['password' => Hash::make($dentistPassword)])->save();
        }

        // PediatricDentistSeeder deliberately leaves photo_path unset (its
        // own comment: "not something a fresh-environment seed run can
        // reproduce") — but this exact file IS real and already committed
        // to git (storage/app/public/avatars/), the clinic's actual cropped
        // headshot for her. Only fills it in if still empty, so a later
        // re-upload through My Profile is never overwritten by this.
        $pediatric = User::where('email', 'pediatric@smilebaydental.com')->first();
        if ($pediatric?->dentistProfile && ! $pediatric->dentistProfile->photo_path
            && Storage::disk('public')->exists('avatars/ef7d908dde5ac460cc34e5a90955d289201bf050.jpg')) {
            $pediatric->dentistProfile->update([
                'photo_path' => Storage::disk('public')->url('avatars/ef7d908dde5ac460cc34e5a90955d289201bf050.jpg'),
            ]);
        }

        $this->repairBrokenDentistPhotos();
    }

    private function firstOrCreateStaff(string $email, string $name, string $role, ?string $password): ?User
    {
        if (! $password) {
            $this->command?->warn("Skipped seeding {$role} account ({$email}) — its SEED_*_PASSWORD env var isn't set.");

            return null;
        }

        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => $role,
                'status' => 'active',
            ]
        );

        if (! $user->email_verified_at) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        return $user;
    }

    // Belt-and-suspenders: the 2026_08_13 migration already inserts these
    // same rows on every fresh database (migrate runs before this seeder
    // ever does), so in the normal case this is a no-op. Only matters if
    // clinic_schedules rows are ever deleted later without re-running
    // migrations — re-running this seeder alone then still restores them.
    private function seedClinicScheduleIfEmpty(): void
    {
        if (ClinicSchedule::count() > 0) {
            return;
        }

        $now = now();

        $days = [
            ['day_of_week' => 0, 'open_time' => null, 'close_time' => null, 'is_open' => false], // Sunday
            ['day_of_week' => 1, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 2, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 3, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 4, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 5, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true],
            ['day_of_week' => 6, 'open_time' => '09:00:00', 'close_time' => '18:00:00', 'is_open' => true], // Saturday
        ];

        DB::table('clinic_schedules')->insertOrIgnore(array_map(
            fn (array $day) => [...$day, 'created_at' => $now, 'updated_at' => $now],
            $days
        ));
    }

    // Railway's container filesystem is NOT persistent across deploys (no
    // volume set up for storage/app/public yet) — a dentist photo uploaded
    // through My Profile while one container was running is simply gone
    // once the next deploy spins up a fresh one, but dentist_profiles.
    // photo_path (in the separate, persistent MySQL database) still points
    // at it. That stale URL then 404s wherever it's rendered, showing as a
    // broken image with overflowing alt text instead of falling back to
    // the frontend's KNOWN_DENTIST_PHOTOS map (which only kicks in when
    // photo_path is null/empty) — self-heals here on every deploy until a
    // persistent volume makes this unnecessary.
    private function repairBrokenDentistPhotos(): void
    {
        $publicUrlPrefix = rtrim(config('app.url'), '/').'/storage/';

        DentistProfile::whereNotNull('photo_path')->get()->each(function (DentistProfile $profile) use ($publicUrlPrefix) {
            if (! str_starts_with($profile->photo_path, $publicUrlPrefix)) {
                return;
            }

            $relativePath = substr($profile->photo_path, strlen($publicUrlPrefix));

            if (! Storage::disk('public')->exists($relativePath)) {
                $this->command?->warn("Clearing stale photo_path for dentist_profiles#{$profile->id} — the uploaded file no longer exists on disk.");
                $profile->update(['photo_path' => null]);
            }
        });
    }
}
