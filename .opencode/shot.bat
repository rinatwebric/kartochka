@echo off
setlocal
set CH="C:\Program Files\Google\Chrome\Application\chrome.exe"
set OUT=C:\Users\user\Desktop\kartochka\docs\screens\landing.png
set PROF=C:\Users\user\AppData\Local\Temp\shotprof1
if exist "%OUT%" del "%OUT%"
%CH% --headless=old --disable-gpu --no-sandbox --no-first-run --no-default-browser-check --user-data-dir=%PROF% --hide-scrollbars --window-size=1440,2400 --screenshot=%OUT% http://127.0.0.1:3000/
echo EXIT=%ERRORLEVEL%
if exist "%OUT%" (echo SIZE: & dir /b "%OUT%") else (echo NO_FILE)
