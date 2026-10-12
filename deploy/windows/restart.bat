@echo off
REM إعادة تشغيل النظام بعد التحديث (Run as administrator)
schtasks /End /TN "RehabSystem" >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /Run /TN "RehabSystem"
echo Restarted.
pause
