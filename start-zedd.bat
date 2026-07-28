
@echo off

cd /d "%~dp0zedd-platform"
call npm install
call npm run build

echo.
cd /d "%~dp0zedd-app"
call npm install
call npm run start

pause
