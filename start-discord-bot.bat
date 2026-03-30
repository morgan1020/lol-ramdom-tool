@echo off
setlocal

cd /d "%~dp0"
powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%~dp0start-discord-bot.ps1"
