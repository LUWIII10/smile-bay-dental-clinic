<?php

use App\Models\HmoProvider;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Storage;

return new class extends Migration
{
    /**
     * Medicard and Flexicare's logos have been hardcoded frontend assets
     * since before hmo_providers.logo_path existed (see that migration's
     * own comment) — a special case that meant they couldn't be edited or
     * have their logo removed the same way any other provider can, since
     * "Remove Logo" only makes sense against a real stored file. This
     * copies the exact same two image files into public storage, the same
     * place HmoVerificationQueue/Settings' own "Upload Logo" button stores
     * one, and points their logo_path at the result — making them
     * ordinary, fully editable rows like every provider added since.
     * Pairs with the frontend removing its KNOWN_HMO_PROVIDER_LOGOS
     * fallback in the same commit, so this is the only place either logo
     * lives going forward.
     */
    public function up(): void
    {
        $assets = [
            'Medicard' => __DIR__.'/assets/hmo-logos/medicard.png',
            'Flexicare' => __DIR__.'/assets/hmo-logos/flexicare.png',
        ];

        foreach ($assets as $name => $sourcePath) {
            $provider = HmoProvider::where('name', $name)->first();

            if (! $provider || $provider->logo_path || ! file_exists($sourcePath)) {
                // Not found, already has a real logo (re-running this
                // migration, or an admin already replaced it since), or the
                // bundled asset is missing — never overwrite a value an
                // admin may have already set.
                continue;
            }

            $storedPath = 'hmo-logos/'.strtolower($name).'-launch-logo.png';
            Storage::disk('public')->put($storedPath, file_get_contents($sourcePath));

            $provider->update(['logo_path' => '/storage/'.$storedPath]);
        }
    }

    public function down(): void
    {
        foreach (['Medicard', 'Flexicare'] as $name) {
            $storedPath = 'hmo-logos/'.strtolower($name).'-launch-logo.png';
            Storage::disk('public')->delete($storedPath);

            HmoProvider::where('name', $name)
                ->where('logo_path', '/storage/'.$storedPath)
                ->update(['logo_path' => null]);
        }
    }
};
