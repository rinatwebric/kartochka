@echo off
setlocal
cd /d C:\Users\user\Desktop\kartochka
if not exist .opencode\logs mkdir .opencode\logs

echo ===== START T5 %DATE% %TIME% >> .opencode\logs\chain.log
opencode run -m meta/muse-spark-1.3-contributor --auto "Выполни задачу T5 из файла .opencode/prompts/T5.md полностью. Работай только в папке C:\Users\user\Desktop\kartochka. Сначала прочитай AGENTS.md, MASTER.md раздел 7 и docs/HANDOFF.md. Работай автономно, проверь pnpm build и scripts/check-rules.ts, потом git commit. Не пуш." >> .opencode\logs\T5.log 2>&1
echo ===== END T5 errorlevel=%ERRORLEVEL% >> .opencode\logs\chain.log
if errorlevel 1 exit /b 1
echo ===== START T6 %DATE% %TIME% >> .opencode\logs\chain.log
opencode run -m meta/muse-spark-1.3-contributor --auto "Выполни задачу T6 из файла .opencode/prompts/T6.md полностью. Работай только в папке C:\Users\user\Desktop\kartochka. Сначала прочитай AGENTS.md, MASTER.md разделы 5 и 9 и docs/HANDOFF.md. Загрузи скилл frontend-design для блока экспорта. Работай автономно, проверь pnpm build, потом git commit. Не пуш." >> .opencode\logs\T6.log 2>&1
echo ===== END T6 errorlevel=%ERRORLEVEL% >> .opencode\logs\chain.log
if errorlevel 1 exit /b 1
echo ===== START T7 %DATE% %TIME% >> .opencode\logs\chain.log
opencode run -m meta/muse-spark-1.3-contributor --auto "Выполни задачу T7 из файла .opencode/prompts/T7.md полностью. Работай только в папке C:\Users\user\Desktop\kartochka. Сначала прочитай AGENTS.md, MASTER.md раздел 9 и docs/HANDOFF.md. Загрузи скилл frontend-design. Работай автономно, проверь pnpm build и рендер страниц, потом git commit. Не пуш." >> .opencode\logs\T7.log 2>&1
echo ===== END T7 errorlevel=%ERRORLEVEL% >> .opencode\logs\chain.log
if errorlevel 1 exit /b 1
echo ALL_DONE >> .opencode\logs\chain.log
