@echo off
setlocal

cd /d "%~dp0"
wscript.exe "%~dp0start-site-hub.vbs"

endlocal
