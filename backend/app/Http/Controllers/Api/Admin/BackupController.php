<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\DatabaseBackup;
use App\Services\DatabaseBackupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BackupController extends Controller
{
    public function __construct(private DatabaseBackupService $backups) {}

    public function index()
    {
        return response()->json([
            'data' => [
                'settings' => $this->backups->settings(),
                'history' => $this->backups->history(),
                'staleness' => $this->backups->staleness(),
                'next_run' => $this->backups->nextScheduledDate(),
            ],
        ]);
    }

    public function updateSettings(Request $request)
    {
        $validated = $request->validate([
            'frequency' => ['required', Rule::in(['off', 'weekly', 'monthly'])],
        ]);

        $settings = $this->backups->updateFrequency($validated['frequency']);

        return response()->json(['data' => $settings]);
    }

    /**
     * "Back Up Now" — runs synchronously inside this request rather than
     * being queued. This app's database is small enough that a full dump
     * finishes in well under PHP's default execution time limit; if that
     * ever stops being true, the natural next step is queueing this
     * properly (QUEUE_CONNECTION=database is already configured), but that
     * needs a worker process actually running, which isn't set up yet.
     */
    public function store(Request $request)
    {
        try {
            $backup = $this->backups->generate('manual', $request->user()->id);

            return response()->json(['data' => $backup, 'history' => $this->backups->history()], 201);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Backup failed: '.$e->getMessage()], 500);
        }
    }

    public function download(DatabaseBackup $backup)
    {
        if ($backup->status !== 'completed') {
            return response()->json(['message' => 'This backup is not available to download.'], 422);
        }

        $path = $this->backups->filePath($backup);

        if (! Storage::disk('local')->exists($path)) {
            return response()->json(['message' => 'This backup file is missing from storage.'], 404);
        }

        return Storage::disk('local')->download($path, $backup->filename);
    }

    public function destroy(DatabaseBackup $backup)
    {
        Storage::disk('local')->delete($this->backups->filePath($backup));
        $backup->delete();

        return response()->json(['data' => $this->backups->history()]);
    }
}
