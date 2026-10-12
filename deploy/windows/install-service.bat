@echo off
REM يسجّل النظام كمهمة تعمل تلقائياً عند تشغيل الخادم (شغّله كمسؤول Run as administrator)
set APPDIR=%~dp0..\..
if not exist "%APPDIR%\data" mkdir "%APPDIR%\data"
schtasks /Create /TN "RehabSystem" /TR "\"%~dp0start.bat\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
schtasks /Run /TN "RehabSystem"
netsh advfirewall firewall add rule name="RehabSystem 8080" dir=in action=allow protocol=TCP localport=8080
echo.
echo Installed. Open http://%COMPUTERNAME%:8080 from any device on the network
pause
