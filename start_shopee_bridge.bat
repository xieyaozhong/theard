@echo off
setlocal
cd /d "%~dp0"
echo THEARD x Shopee Affiliate local bridge
echo Watches your configured Downloads handoff every 5 minutes.
echo No Shopee password, cookie, MFA, or OpenAI API key is used.
echo.
:loop
python affiliate\sync_downloads.py
timeout /t 300 /nobreak >nul
goto loop
