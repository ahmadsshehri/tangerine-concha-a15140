@echo off
REM تشغيل نظام إدارة المراكز التأهيلية (تشغّله مهمة RehabSystem تلقائياً)
cd /d "%~dp0\..\.."
set "NODE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist data mkdir data
"%NODE%" --disable-warning=ExperimentalWarning server\index.js >> data\server.log 2>&1
