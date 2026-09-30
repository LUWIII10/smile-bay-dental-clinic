# One-command fallback for defense day: if the internet (or the Railway-
# hosted site specifically) is unreachable, this serves the EXACT SAME app
# from this laptop, hitting local XAMPP MySQL instead of the live database.
# Same codebase, same login, same UI - only difference is the URL
# (http://localhost:8000 instead of the Railway one) and which database is
# behind it.
#
# How: production's own Dockerfile builds the React frontend and copies it
# into Laravel's public/ folder, so one Laravel process serves both the API
# and the UI from a single origin (see routes/web.php's SpaController). This
# script does the exact same thing, locally:
#   1. Builds the React frontend  (npm run build)
#   2. Copies that build into backend/public/
#   3. Starts Laravel's own server on port 8000
#   4. Opens it in your browser
#
# Requirement: XAMPP's MySQL must already be running (Apache does NOT need
# to be - this doesn't use it). Start XAMPP Control Panel and click Start
# next to MySQL first if it isn't already.
#
# NOTE - one thing this can't fix: OTP emails (patient registration, Forgot
# Password) go out over real Gmail SMTP, which still needs real internet.
# If you're demoing fully offline, use an account that's already verified/
# logged-in rather than a live registration or password-reset flow.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"

Write-Host "== Smile Bay: Offline/Local Backup ==" -ForegroundColor Cyan

Write-Host "`n[1/4] Checking local MySQL (XAMPP)..." -ForegroundColor Yellow
$mysqlUp = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue -InformationLevel Quiet
if (-not $mysqlUp) {
    Write-Host "MySQL isn't running on 127.0.0.1:3306." -ForegroundColor Red
    Write-Host "Open XAMPP Control Panel, click Start next to MySQL, then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Host "MySQL is up." -ForegroundColor Green

Write-Host "`n[2/4] Building the frontend (npm run build)..." -ForegroundColor Yellow
Push-Location $frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "Frontend build failed - see the error above." -ForegroundColor Red
    exit 1
}
Pop-Location

Write-Host "`n[3/4] Copying the build into Laravel's public folder..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $frontend "dist\*") -Destination (Join-Path $backend "public") -Recurse -Force

Write-Host "`n[4/4] Starting the local server..." -ForegroundColor Yellow
Start-Job -ScriptBlock { Start-Sleep -Seconds 2; Start-Process "http://localhost:8000" } | Out-Null

Write-Host "`nRunning at http://localhost:8000" -ForegroundColor Green
Write-Host "Leave THIS window open during your demo - closing it (or Ctrl+C) stops the server." -ForegroundColor Green
Write-Host ""

Push-Location $backend
php82 artisan serve --port=8000
Pop-Location
