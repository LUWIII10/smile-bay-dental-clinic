<?php

namespace App\Services;

use App\Models\BackupSetting;
use App\Models\DatabaseBackup;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Generates, lists, and prunes full-database .sql backups — pure PHP, no
 * shell-out to mysqldump. Confirmed live on Hostinger (read-only check via
 * SSH before building this): exec/shell_exec/proc_open are all disabled in
 * disable_functions for the exact PHP binary a cron-triggered
 * `schedule:run` would use, which rules out mysqldump (and packages like
 * spatie/laravel-backup, which depends on it for MySQL) even though the
 * mysqldump binary itself exists on the server — PHP just isn't allowed to
 * invoke it. This reimplements the same thing directly against the existing
 * DB connection instead: SHOW CREATE TABLE for schema (the same source
 * mysqldump itself reads), PDO::quote() for every value (never hand-rolled
 * escaping), chunked reads so a large table doesn't need to fit in memory
 * at once, and incremental fwrite() so the backup file doesn't either.
 */
class DatabaseBackupService
{
    // How many completed backups to keep per bucket before the oldest are
    // deleted — manual backups get their own cap too (not unlimited) so an
    // admin repeatedly clicking "Back Up Now" can't quietly fill the disk.
    private const RETENTION = [
        'weekly' => 4,
        'monthly' => 3,
        'manual' => 5,
    ];

    // The 'local' disk (storage/app/private) — NOT 'public' (storage/app/public,
    // served at /storage with a real URL). Backups contain every patient's
    // full record, so they only ever live somewhere with no direct web path
    // at all; BackupController::download() is the only way out, behind
    // role:admin like every other admin endpoint.
    private const DISK = 'local';
    private const DIR = 'backups';

    public function settings(): BackupSetting
    {
        return BackupSetting::firstOrCreate([], ['frequency' => 'off']);
    }

    public function updateFrequency(string $frequency): BackupSetting
    {
        $settings = $this->settings();
        $settings->update(['frequency' => $frequency]);

        return $settings;
    }

    /**
     * Plain arrays, not models — this is the exact shape the Settings page
     * reads, including the triggered-by admin's name (triggeredByUser isn't
     * useful to the frontend as a nested relation here, just the name).
     */
    public function history(): array
    {
        return DatabaseBackup::with('triggeredByUser:id,name')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (DatabaseBackup $b) => [
                'id' => $b->id,
                'filename' => $b->filename,
                'frequency_tag' => $b->frequency_tag,
                'size_bytes' => $b->size_bytes,
                'status' => $b->status,
                'error_message' => $b->error_message,
                'completed_at' => $b->completed_at?->toIso8601String(),
                'triggered_by_name' => $b->triggeredByUser->name ?? null,
            ])
            ->values()
            ->all();
    }

    /**
     * null = nothing to warn about (frequency is 'off', or the most recent
     * completed backup is still within the expected window). Otherwise an
     * array the Settings page turns into the amber "stale backup" banner.
     * ['never' => true] when frequency is on but not one single backup has
     * ever completed yet — a different message from "N days ago" since
     * there's no date to show.
     */
    public function staleness(): ?array
    {
        $settings = $this->settings();

        if ($settings->frequency === 'off') {
            return null;
        }

        $last = DatabaseBackup::where('status', 'completed')
            ->latest('completed_at')
            ->first();

        if (! $last) {
            return ['never' => true];
        }

        $expectedDays = $settings->frequency === 'weekly' ? 7 : 30;
        $graceDays = 1; // Scheduled job runs daily at a fixed time — a 1-day cushion keeps this from firing on the exact due date before that run has even happened yet.
        $daysSince = $last->completed_at->diffInDays(now());

        if ($daysSince <= $expectedDays + $graceDays) {
            return null;
        }

        return [
            'never' => false,
            'days_since' => $daysSince,
            'expected_days' => $expectedDays,
            'frequency' => $settings->frequency,
        ];
    }

    /**
     * Same due-date math RunScheduledBackup itself uses to decide whether
     * to actually run — read-only here, purely for the "Next automatic
     * backup: ..." line in Settings. null when frequency is 'off'.
     */
    public function nextScheduledDate(): ?string
    {
        $settings = $this->settings();

        if ($settings->frequency === 'off') {
            return null;
        }

        $last = DatabaseBackup::where('frequency_tag', $settings->frequency)
            ->where('status', 'completed')
            ->latest('completed_at')
            ->first();

        $intervalDays = $settings->frequency === 'weekly' ? 7 : 30;
        $base = $last?->completed_at ?? now();

        return $base->copy()->addDays($intervalDays)->toDateString();
    }

    /**
     * $frequencyTag: 'weekly'|'monthly' (the scheduled command) or 'manual'
     * (BackupController::store(), the "Back Up Now" button) — purely a
     * label for the history list and which retention bucket this counts
     * against, never read by the dump logic itself.
     */
    public function generate(string $frequencyTag, ?int $triggeredBy = null): DatabaseBackup
    {
        $backup = DatabaseBackup::create([
            'frequency_tag' => $frequencyTag,
            'status' => 'running',
            'triggered_by' => $triggeredBy,
            'started_at' => now(),
        ]);

        $filename = 'smile-bay-backup-'.now()->format('Y-m-d-His').'.sql';
        $relativePath = self::DIR.'/'.$filename;

        try {
            $disk = Storage::disk(self::DISK);
            $disk->makeDirectory(self::DIR);
            $absolutePath = $disk->path($relativePath);

            $this->writeDump($absolutePath);

            $backup->update([
                'filename' => $filename,
                'size_bytes' => $disk->size($relativePath),
                'status' => 'completed',
                'completed_at' => now(),
            ]);
        } catch (Throwable $e) {
            // Never leave a half-written file behind — download() already
            // refuses anything not status === 'completed', so this is purely
            // disk hygiene, not a safety requirement.
            if (Storage::disk(self::DISK)->exists($relativePath)) {
                Storage::disk(self::DISK)->delete($relativePath);
            }

            $backup->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            throw $e;
        }

        $this->pruneOld($frequencyTag);

        return $backup->fresh();
    }

    public function filePath(DatabaseBackup $backup): string
    {
        return self::DIR.'/'.$backup->filename;
    }

    /**
     * Streams the dump straight to disk via a plain file handle instead of
     * building one giant string in memory — this app's database is small
     * today, but there's no reason the backup generator itself should have
     * a memory ceiling tied to database size when chunked reads + fwrite()
     * avoid it for about the same amount of code.
     */
    private function writeDump(string $absolutePath): void
    {
        $handle = fopen($absolutePath, 'w');

        if ($handle === false) {
            throw new \RuntimeException('Could not open the backup file for writing.');
        }

        try {
            $connection = config('database.default');
            $database = config("database.connections.{$connection}.database");

            fwrite($handle, "-- Smile Bay Dental Clinic — full database backup\n");
            fwrite($handle, '-- Generated '.now()->toDateTimeString()."\n");
            fwrite($handle, "-- Database: {$database}\n");
            fwrite($handle, "-- Restore with: mysql -u <user> -p <database> < this-file.sql\n\n");
            // Disabled for the whole restore, not per-statement — lets every
            // table get dropped/recreated/filled in whatever order SHOW
            // TABLES returned them, regardless of foreign key dependencies
            // between them, same as mysqldump's own default behavior.
            fwrite($handle, "SET FOREIGN_KEY_CHECKS=0;\n");
            fwrite($handle, "SET NAMES utf8mb4;\n\n");

            $pdo = DB::connection()->getPdo();

            $tables = collect(DB::select('SHOW TABLES'))
                ->map(fn ($row) => array_values((array) $row)[0])
                ->all();

            foreach ($tables as $table) {
                $this->writeTable($handle, $table, $pdo);
            }

            fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
        } finally {
            fclose($handle);
        }
    }

    /**
     * @param resource $handle
     */
    private function writeTable($handle, string $table, \PDO $pdo): void
    {
        fwrite($handle, "-- --------------------------------------------------\n");
        fwrite($handle, "-- Table: {$table}\n");
        fwrite($handle, "-- --------------------------------------------------\n");
        fwrite($handle, "DROP TABLE IF EXISTS `{$table}`;\n");

        // SHOW CREATE TABLE — the exact same source mysqldump itself reads —
        // instead of reconstructing DDL by hand from information_schema,
        // which is easy to get subtly wrong (collation, generated columns,
        // index types) in ways that wouldn't show up until a real restore.
        $createRow = (array) DB::select("SHOW CREATE TABLE `{$table}`")[0];
        $createSql = $createRow['Create Table'] ?? array_values($createRow)[1];
        fwrite($handle, $createSql.";\n\n");

        $columns = collect(DB::select("SHOW COLUMNS FROM `{$table}`"))->pluck('Field')->all();

        if (empty($columns)) {
            return;
        }

        // chunkById, not a plain offset-based chunk() — an offset chunk can
        // skip or repeat rows if the table is read while being written to
        // elsewhere; chunkById instead re-queries "WHERE id > last seen"
        // each page, which stays correct regardless. Falls back to the
        // table's own first column on the rare table with no `id`.
        $cursorColumn = in_array('id', $columns, true) ? 'id' : $columns[0];
        $columnList = implode('`, `', $columns);

        DB::table($table)->orderBy($cursorColumn)->chunkById(500, function (Collection $rows) use ($handle, $table, $columnList, $pdo) {
            if ($rows->isEmpty()) {
                return;
            }

            $valueGroups = [];
            foreach ($rows as $row) {
                $values = array_map(
                    // Every non-null value goes through PDO::quote() —
                    // never hand-rolled escaping — regardless of whether
                    // the driver happened to return it as a PHP string or
                    // a native int/float; a quoted numeric literal
                    // ('123') is valid SQL for an integer column too, so
                    // this one rule covers every column type without
                    // needing to know which type each one is.
                    fn ($value) => $value === null ? 'NULL' : $pdo->quote((string) $value),
                    (array) $row
                );
                $valueGroups[] = '('.implode(', ', $values).')';
            }

            fwrite($handle, "INSERT INTO `{$table}` (`{$columnList}`) VALUES\n".implode(",\n", $valueGroups).";\n");
        }, $cursorColumn);

        fwrite($handle, "\n");
    }

    private function pruneOld(string $frequencyTag): void
    {
        $keep = self::RETENTION[$frequencyTag] ?? 5;

        $old = DatabaseBackup::where('frequency_tag', $frequencyTag)
            ->where('status', 'completed')
            ->orderByDesc('completed_at')
            ->skip($keep)
            ->take(PHP_INT_MAX)
            ->get();

        foreach ($old as $backup) {
            Storage::disk(self::DISK)->delete($this->filePath($backup));
            $backup->delete();
        }
    }
}
