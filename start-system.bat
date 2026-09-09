@echo off
cd /d "C:\xampp\htdocs\SMILE BAY SYSTEM"

start "BACKEND"  cmd /k "cd backend && php82 artisan serve"
timeout /t 2 >nul
start "MAILMAN"  cmd /k "cd backend && php82 artisan queue:work"
timeout /t 2 >nul
start "FRONTEND" cmd /k "cd frontend && npm run dev"

echo.
echo Tatlong window: BACKEND, MAILMAN, FRONTEND
echo Huwag isara ang kahit alin habang gumagana ang system.
echo.
pause