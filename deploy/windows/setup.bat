@echo off
REM ============================================================
REM  Rehab Centers Management System - Windows installer
REM  Right-click > Run as administrator
REM  ينصّب Node.js (من مجلد requirements) ويجهّز البيانات ويشغّل النظام تلقائياً مع الخادم
REM ============================================================
setlocal
title Rehab System Setup

REM مجلد البرنامج: نفس مجلد هذا الملف في الحزمة الجاهزة، أو جذر المشروع إذا شُغّل من deploy\windows
set "APPDIR=%~dp0"
if not exist "%APPDIR%package.json" set "APPDIR=%~dp0..\..\"
cd /d "%APPDIR%"

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [!] Please right-click setup.bat and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)

echo.
echo  [1/5] Checking Node.js ...
where node >nul 2>&1
if not errorlevel 1 goto :nodecheck
if exist "%ProgramFiles%\nodejs\node.exe" goto :nodepath
set "MSI="
for %%f in ("%APPDIR%requirements\node-v*-x64.msi") do set "MSI=%%~ff"
if not defined MSI (
  echo  [!] Node.js is not installed and no installer was found in the requirements folder.
  echo      Download Node.js 24 LTS from https://nodejs.org and run setup.bat again.
  pause
  exit /b 1
)
echo        Installing Node.js from requirements folder (1-2 minutes) ...
msiexec /i "%MSI%" /qn /norestart
if errorlevel 1 (
  echo  [!] Node.js installation failed.
  pause
  exit /b 1
)
:nodepath
set "PATH=%ProgramFiles%\nodejs;%PATH%"
:nodecheck
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo  [!] Node.js 22.13 or newer is required. Installed version:
  node --version
  echo      Install Node.js 24 LTS from the requirements folder or https://nodejs.org
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo        Node.js %%v OK

echo.
echo  [2/5] Preparing data folder and settings ...
if not exist "%APPDIR%data" mkdir "%APPDIR%data"
if not exist "%APPDIR%server\.env" copy "%APPDIR%server\.env.example" "%APPDIR%server\.env" >nul
for /f "delims=" %%p in ('node --disable-warning=ExperimentalWarning server\manage.js port') do set "PORT=%%p"
if not defined PORT set "PORT=8080"
echo        Port: %PORT%   (change it in server\.env)

echo.
echo  [3/5] Administrator account
node --disable-warning=ExperimentalWarning server\manage.js has-admin
if not errorlevel 1 (
  echo        An admin account already exists - skipping.
  goto :service
)
echo        If you will import the data from Firebase, press Enter to skip this step.
set "ADMIN_EMAIL="
set /p "ADMIN_EMAIL=       Admin email: "
if not defined ADMIN_EMAIL goto :service
set /p "ADMIN_PASS=       Admin password (6+ characters): "
set /p "ADMIN_NAME=       Admin name: "
node --disable-warning=ExperimentalWarning server\manage.js create-admin "%ADMIN_EMAIL%" "%ADMIN_PASS%" "%ADMIN_NAME%"

:service
echo.
echo  [4/5] Registering automatic startup ...
schtasks /End /TN "RehabSystem" >nul 2>&1
schtasks /Create /TN "RehabSystem" /TR "\"%APPDIR%deploy\windows\start.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F >nul
if errorlevel 1 (
  echo  [!] Could not register the scheduled task.
  pause
  exit /b 1
)
schtasks /Run /TN "RehabSystem" >nul

echo.
echo  [5/5] Opening port %PORT% in Windows Firewall ...
netsh advfirewall firewall delete rule name="RehabSystem" >nul 2>&1
netsh advfirewall firewall add rule name="RehabSystem" dir=in action=allow protocol=TCP localport=%PORT% >nul

echo.
echo  ============================================================
echo   Done. The system starts automatically with Windows.
echo   Open from any device on the network:
echo       http://%COMPUTERNAME%:%PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo      http:/%%a:%PORT%
echo   Data:    %APPDIR%data
echo   Log:     %APPDIR%data\server.log
echo  ============================================================
echo.
pause
