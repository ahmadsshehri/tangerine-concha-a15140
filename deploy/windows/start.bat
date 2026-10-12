@echo off
REM تشغيل نظام إدارة المراكز التأهيلية على خادم Windows
cd /d "%~dp0\..\.."
node --disable-warning=ExperimentalWarning server\index.js >> data\server.log 2>&1
