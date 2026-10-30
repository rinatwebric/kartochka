# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T0 выполнен 30.10.2026. Каркас собирается (`pnpm build` exit=0), первый коммит сделан.
Следующая задача — T1 из MASTER.md раздел 12 (дизайн-система и лендинг).

## Что готово
- Next.js 15 проект в этой папке: package.json, tsconfig (strict + noUncheckedIndexedAccess),
  next.config.ts (serverExternalPackages sharp), postcss, .env.example, .gitignore, LICENSE MIT, README-заготовка.
- Дерево папок и заглушки строго по MASTER.md разделу 4: app/ (layout, page, globals, studio/[id],
  r/[id], batch, api/health, api/stats), components/{ui,landing,upload,studio,batch},
  lib/{env,models×6,prompts×2,pipeline×11,utils×7,mock×2}, evals (cases.json=[], run.ts TODO T8),
  fixtures/{demo,photos}, rules/*.json не тронуты.
- Версии (node v24.13.0, pnpm 12.16.1): next 15.5.28, react 19.3.1, tailwind 4.3.3,
  typescript 5.9.3, zod 4.6.7, sharp 0.34.5, jszip 3.10.2, lucide-react 0.545.0.
- Отступлений: tsconfig target ES2017 добавил сам Next (см. DECISIONS.md). Никакого any.

## Что дальше
T1: дизайн-система и лендинг (скиллы frontend-design, theme-factory; сначала прочитать
MASTER.md разделы 9 и 11). Заглушка app/page.tsx ждёт замены. shadcn/ui инициализировать в T1.

## Открытые вопросы
- Точные имена полей sam-3.1 и images/edits — сверить по документации в T2.
- Цифры в rules/*.json не подтверждены официальными страницами (verified: false).
- `pnpm lint` (next lint) не прогонялся — в T0 не требуется, проверить в T1.
- На что смотреть: /api/health отдаёт { ok, mock, models }, /api/stats — нулевые счётчики.
