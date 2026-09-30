@echo off
REM Double-click this if the internet/live site goes down during the defense.
REM Runs run-offline-backup.ps1 without needing to fight PowerShell's
REM execution policy first — see that file for what it actually does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-offline-backup.ps1"
pause
