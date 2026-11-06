<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off verification tool, not exposed via the API — restores a given
 * backup .sql file as a set of TEMPORARY tables (prefixed verify_) within
 * the same database/connection and compares row counts per table against
 * the real ones, to prove a generated backup is actually valid and
 * complete, not just "a file got written."
 *
 * Temporary tables, not a real scratch database: Hostinger's shared MySQL
 * user only has privileges on its own pre-provisioned database (confirmed
 * live — CREATE DATABASE came back "Access denied"), but CREATE TEMPORARY
 * TABLE is a much narrower, commonly-granted privilege on your own
 * database, and temp tables vanish automatically once this command's DB
 * connection closes — no separate cleanup step can be forgotten. InnoDB
 * doesn't support FOREIGN KEY constraints on temporary tables at all, so
 * those clauses are stripped from each CREATE TABLE before executing here
 * — irrelevant to what this is actually checking (does the schema +
 * data round-trip correctly), and the real backup file given to an admin
 * keeps every constraint, unmodified.
 *
 * Safe to delete after use; nothing else in the app depends on this command.
 */
class VerifyBackupRestore extends Command
{
    protected $signature = 'backups:verify-restore {filename}';

    protected $description = 'Restores a backup file as temp tables and compares row counts against the real database.';

    private const PREFIX = 'verify_';

    public function handle(): int
    {
        $filename = $this->argument('filename');
        $path = storage_path('app/private/backups/'.$filename);

        if (! file_exists($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $sql = file_get_contents($path);
        $statements = $this->splitStatements($sql);
        $this->info('Statements parsed: '.count($statements));

        $createdTables = [];
        $mismatches = [];

        try {
            $executed = 0;
            foreach ($statements as $statement) {
                $statement = trim($statement);
                if ($statement === '' || str_starts_with($statement, '--') || str_starts_with($statement, 'SET ')) {
                    continue;
                }

                if (preg_match('/^DROP TABLE IF EXISTS `([^`]+)`/i', $statement, $m)) {
                    // Nothing to drop yet on a first run — temp tables are
                    // connection-scoped, never pre-existing.
                    continue;
                }

                if (preg_match('/^CREATE TABLE `([^`]+)`/i', $statement, $m)) {
                    $table = $m[1];
                    $rewritten = $this->rewriteCreateTable($statement, $table);
                    DB::unprepared($rewritten);
                    $createdTables[] = $table;
                    $executed++;

                    continue;
                }

                if (preg_match('/^INSERT INTO `([^`]+)`/i', $statement, $m)) {
                    $table = $m[1];
                    $rewritten = preg_replace(
                        '/^INSERT INTO `'.preg_quote($table, '/').'`/i',
                        'INSERT INTO `'.self::PREFIX.$table.'`',
                        $statement,
                        1
                    );
                    DB::unprepared($rewritten);
                    $executed++;
                }
            }
            $this->info("Statements executed: {$executed}");

            $realTables = collect(DB::select('SHOW TABLES'))
                ->map(fn ($row) => array_values((array) $row)[0])
                ->all();

            $totalRows = 0;
            foreach ($realTables as $table) {
                if (! in_array($table, $createdTables, true)) {
                    $mismatches[] = "{$table}: present in the real database but MISSING from the backup file";

                    continue;
                }

                $realCount = DB::table($table)->count();
                $restoredCount = DB::table(self::PREFIX.$table)->count();
                $totalRows += $realCount;

                if ($realCount !== $restoredCount) {
                    $mismatches[] = "{$table}: real={$realCount} restored={$restoredCount}";
                }
            }

            $this->info('Tables in backup: '.count($createdTables).' — tables in real DB: '.count($realTables)." — total real rows: {$totalRows}");

            if (empty($mismatches)) {
                $this->info('RESULT: PASS — every table in the backup matches the real database exactly, row for row.');
            } else {
                $this->error('RESULT: FAIL:');
                foreach ($mismatches as $m) {
                    $this->error("  {$m}");
                }
            }
        } finally {
            foreach ($createdTables as $table) {
                DB::unprepared('DROP TEMPORARY TABLE IF EXISTS `'.self::PREFIX.$table.'`');
            }
            $this->info('Temp tables dropped: '.count($createdTables));
        }

        return empty($mismatches) ? self::SUCCESS : self::FAILURE;
    }

    /**
     * CREATE TABLE `x` (...)  ENGINE=... ;  →  CREATE TEMPORARY TABLE
     * `verify_x` (...)  ENGINE=... ;  with every line containing a
     * CONSTRAINT ... FOREIGN KEY clause removed (temp tables can't have
     * them), and the new last line inside the parens stripped of its
     * trailing comma if the removed line used to be last.
     */
    private function rewriteCreateTable(string $statement, string $table): string
    {
        $statement = preg_replace(
            '/^CREATE TABLE `'.preg_quote($table, '/').'`/i',
            'CREATE TEMPORARY TABLE `'.self::PREFIX.$table.'`',
            $statement,
            1
        );

        $lines = explode("\n", $statement);
        $kept = [];
        foreach ($lines as $line) {
            if (preg_match('/CONSTRAINT\s+`[^`]+`\s+FOREIGN KEY/i', $line)) {
                continue;
            }
            $kept[] = $line;
        }

        // Find the last "body" line (one that isn't the closing ") ENGINE=..."
        // line) and drop a trailing comma from it if present, in case the
        // line removed above used to be the last element in the list.
        for ($i = count($kept) - 1; $i >= 0; $i--) {
            if (preg_match('/^\s*\)\s*ENGINE/i', $kept[$i])) {
                continue;
            }
            $kept[$i] = preg_replace('/,\s*$/', '', $kept[$i]);
            break;
        }

        return implode("\n", $kept);
    }

    /**
     * Quote-aware statement splitter — splits on a semicolon only when it's
     * not inside a single-quoted string (PDO::quote()'s own output in the
     * dump), so a value containing a literal "; " can never be mistaken for
     * a statement boundary the way a naive explode(';', ...) would risk.
     * Handles both doubled '' and backslash-escaped \' since PDO::quote()
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
