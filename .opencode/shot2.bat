@echo off
setlocal
if exist "C:\Users\user\Desktop\kartochka\docs\screens\landing.png" del "C:\Users\user\Desktop\kartochka\docs\screens\landing.png"
start "" /b "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --user-data-dir="C:\Users\user\AppData\Local\Temp\edgeprof1" --hide-scrollbars --window-size=1440,2400 --screenshot="C:\Users\user\Desktop\kartochka\docs\screens\landing.png" --virtual-time-budget=7000 http://127.0.0.1:3000/
echo LAUNCHED
