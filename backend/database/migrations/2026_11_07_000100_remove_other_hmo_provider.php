<?php

use App\Models\HmoProvider;
use App\Models\Patient;
use Illuminate\Database\Migrations\Migration;

// Smile Bay is only accredited for Flexicare and Medicard. "Other" was
// mistakenly seeded as active alongside them (2026_08_10_000200) and the
// demo-patient generator round-robined across whatever was active at the
// time, landing 6 demo patients on it before an admin later deactivated it
// in Settings — which stopped new signups but left the row (and those 6
// patients) behind. This reassigns anyone still on "Other" to a real
// accredited provider, then removes the row outright so it can't be
// reactivated or reselected again.
return new class extends Migration
{
    public function up(): void
    {
        $other = HmoProvider::where('name', 'Other')->first();
        if (! $other) {
            return;
        }

        $accredited = HmoProvider::whereIn('name', ['Flexicare', 'Medicard'])
            ->orderBy('name')
            ->get();

        if ($accredited->count() === 2) {
            Patient::where('hmo_provider_id', $other->id)
                ->orderBy('id')
                ->get(['id'])
                ->each(function (Patient $patient, int $i) use ($accredited) {
                    $patient->update(['hmo_provider_id' => $accredited[$i % 2]->id]);
                });
        }

        $other->delete();
    }

    public function down(): void
    {
        // Reassignments aren't reversible (the original "Other" mapping is
        // gone) — this only restores the row itself, inactive, so it
        // doesn't silently become selectable again if this migration is
        // ever rolled back.
        HmoProvider::firstOrCreate(
            ['name' => 'Other'],
            ['is_active' => false]
        );
    }
};
