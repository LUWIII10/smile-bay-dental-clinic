<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off verification tool, not exposed via the API — restores a given
 * backup .sql file into a throwaway database on the same MySQL server (
 * never touching the real one) and compares row counts per table against
 * the real database, to prove a generated backup is actually valid and
 * complete, not just "a file got written." Drops the scratch database
 * again before exiting either way. Safe to delete after use; nothing else
 * in the app depends on this command existing.
 */
class VerifyBackupRestore extends Command
{
    protected $signature = 'backups:verify-restore {filename}';

    protected $description = 'Restores a backup file into a throwaway database and compares row counts against the real one.';

    public function handle(): int
    {
        $filename = $this->argument('filename');
        $path = storage_path('app/private/backups/'.$filename);

        if (! file_exists($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $scratchDb = 'smilebay_backup_verify_'.time();
        $this->info("Scratch database: {$scratchDb}");

        DB::statement("CREATE DATABASE `{$scratchDb}`");

        config(['database.connections.backup_verify' => array_merge(
            config('database.connections.'.config('database.default')),
            ['database' => $scratchDb]
        )]);

        try {
            $sql = file_get_contents($path);
            $statements = $this->splitStatements($sql);
            $this->info('Statements to execute: '.count($statements));

            $executed = 0;
            foreach ($statements as $statement) {
                $statement = trim($statement);
                if ($statement === '' || str_starts_with($statement, '--')) {
                    continue;
                }
                DB::connection('backup_verify')->unprepared($statement);
                $executed++;
            }
            $this->info("Executed: {$executed}");

            $realTables = collect(DB::select('SHOW TABLES'))
                ->map(fn ($row) => array_values((array) $row)[0])
                ->all();

            $mismatches = [];
            $totalRows = 0;

            foreach ($realTables as $table) {
                $realCount = DB::table($table)->count();
                $restoredCount = DB::connection('backup_verify')->table($table)->count();
                $totalRows += $realCount;

                if ($realCount !== $restoredCount) {
                    $mismatches[] = "{$table}: real={$realCount} restored={$restoredCount}";
                }
            }

            $this->info("Tables checked: ".count($realTables)." — total real rows: {$totalRows}");

            if (empty($mismatches)) {
                $this->info('RESULT: PASS — every table row count matches exactly between the real database and the restored backup.');
            } else {
                $this->error('RESULT: FAIL — mismatches found:');
                foreach ($mismatches as $m) {
                    $this->error("  {$m}");
                }
            }
        } finally {
            DB::purge('backup_verify');
            DB::statement("DROP DATABASE IF EXISTS `{$scratchDb}`");
            $this->info("Scratch database dropped: {$scratchDb}");
        }

        return empty($mismatches) ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Quote-aware statement splitter — splits on a semicolon only when it's
     * not inside a single-quoted string (PDO::quote()'s own output in the
     * dump), so a value containing a literal "; " can never be mistaken for
     * a statement boundary the way a naive explode(';', ...) would risk.
     * Backslash-escaping and doubled '' are both handled since PDO::quote()
     * can produce either depending on the driver's NO_BACKSLASH_ESCAPES mode.
     */
    private function splitStatements(string $sql): array
    {
        $statements = [];
        $current = '';
        $inString = false;
        $length = strlen($sql);

        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];
            $current .= $char;

            if ($char === "'" && $inString) {
                $next = $sql[$i + 1] ?? '';
                $prevBackslashes = 0;
                $j = $i - 1;
                while ($j >= 0 && $sql[$j] === '\\') {
                    $prevBackslashes++;
                    $j--;
                }
                if ($next === "'") {
                    // Doubled '' inside a string — still inside the string,
                    // consume the second quote too and keep going.
                    $current .= $next;
                    $i++;
                } elseif ($prevBackslashes % 2 === 0) {
                    $inString = false;
                }
            } elseif ($char === "'" && ! $inString) {
                $inString = true;
            } elseif ($char === ';' && ! $inString) {
                $statements[] = $current;
                $current = '';
            }
        }

        if (trim($current) !== '') {
            $statements[] = $current;
        }

        return $statements;
    }
}
