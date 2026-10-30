# AGENTS.md — правила для кодинг-агента

Проект: КАРТОЧКА. Веб-приложение, которое превращает фото товара с телефона в карточку для
маркетплейса и проверяет её по регламенту площадки. Хакатон Meta Global AI Developer, трек Indie.

Главный документ проекта — MASTER.md. Читай его перед каждой задачей. Он важнее твоих привычек.

## Железные правила

1. Не выдумывай поля API. Перед работой с моделями открой https://dev.meta.ai/docs. Если документация
   расходится с MASTER.md — права документация, а расхождение запиши в docs/DECISIONS.md.
2. Работай только в рамках текущей задачи. Не рефактори чужие файлы, не «улучшай» то, о чём не просили.
3. Не добавляй зависимости, базы данных, ORM, авторизацию, docker, тестовые фреймворки, redux, i18n.
   Нужна новая зависимость — сначала запиши зачем в docs/DECISIONS.md.
4. Никакого `any` и `@ts-ignore`. Если без них нельзя — строка в docs/DECISIONS.md с причиной.
5. Не говори «готово», пока не запустил проверку и не увидел результат. Формат отчёта:
   `Изменил: <файлы>. Проверил: <команда> -> <что увидел>. Осталось: <список>.`
6. В конце каждой задачи: обнови docs/HANDOFF.md (что сделано, решения, что дальше, на что смотреть)
   и сделай git commit с осмысленным сообщением. Пуш — только если я попросил.
7. Числа, пороги и регламенты берутся из MASTER.md разделов 7 и 8 и из rules/*.json. Не подбирай
   пороги «на глаз» и не меняй их без записи в DECISIONS.md.

## Стек

Next.js 15 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui, lucide-react, sharp,
zod, jszip, pnpm. Деплой Vercel. Один язык на всё: TypeScript, без Python.

## Команды

```
pnpm install
pnpm dev            # локальный сервер, http://localhost:3000
pnpm build          # обязано проходить без ошибок и предупреждений типов
pnpm lint
pnpm evals --mock   # прогон eval-стенда на фикстурах
pnpm evals --live   # прогон на живом API (тратит кредиты, спрашивай разрешение)
```

## Скиллы

В .opencode/skills лежат 22 скилла: дизайн (frontend-design, theme-factory, brand-guidelines,
canvas-design, web-artifacts-builder), QA (webapp-testing), процесс (writing-plans, executing-plans,
test-driven-development, systematic-debugging, verification-before-completion, requesting-code-review,
receiving-code-review, code-review, diagnosing-bugs), спецификации (to-spec, to-tickets, implement,
handoff, brainstorming, skill-creator, karpathy-guidelines).

Перед версткой — frontend-design. Перед разбором непонятного бага — systematic-debugging. Перед
чистыми функциями (identity, rules, whitebg) — test-driven-development. Перед словом «готово» —
verification-before-completion. В конце задачи — handoff.

Карта «задача -> скиллы» в MASTER.md раздел 11. Не грузи все скиллы подряд: это трата контекста.

## Грабли Next.js, которые уже известны

- параметры роутов асинхронные: `const { id } = await params`;
- роуты с sharp и fs: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`
- в next.config.ts: `serverExternalPackages: ["sharp"]`;
- ответы моделей бывают base64 и URL — поддерживай оба;
- шаг пайплайна должен быть идемпотентным, кнопка на клиенте блокируется на время шага.

## Стиль кода

Файлы маленькие и по одной ответственности. Функции с явными типами. Ошибки — типизированные,
с человеческим текстом для UI. Логи одной строкой: `[model] name=... ms=... credits=... status=...`.
Комментарии только там, где объясняют «почему», а не «что».
