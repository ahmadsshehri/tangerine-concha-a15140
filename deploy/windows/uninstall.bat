@echo off
REM إيقاف النظام وإزالة التشغيل التلقائي (لا يحذف البيانات في مجلد data)
REM Right-click > Run as administrator
schtasks /End /TN "RehabSystem" >nul 2>&1
schtasks /Delete /TN "RehabSystem" /F
netsh advfirewall firewall delete rule name="RehabSystem"
echo.
echo Stopped and removed. Your data folder was NOT deleted.
pause
