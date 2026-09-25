<?php

namespace Database\Seeders;

use App\Models\ClinicSchedule;
use App\Models\DentistProfile;
use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
}
