# docs/QA.md — отчёт прогона T9 (30.10.2026, MOCK=1, ключ пустой)

Стенд: `pnpm dev` на порту 3002 (3000 был занят чужим процессом 852), `MODEL_API_KEY` пустой, `MOCK=1`. Все проверки — живыми HTTP-запросами (curl), не «на глаз».

## Зелёное

- `GET /api/health` → `{ok:true, mock:true, models:[5]}`. До T9 врал `mock:false` без ключа — починено через `isMock()`.
- `GET /api/stats` → `{jobs:164, cards:160, credits:0, avgScore:61}` — реальные счётчики с диска. До T9 всегда были нули.
- `GET /` → 200. Кнопка «Собрать карточку» теперь активна: `POST /api/jobs` (synthetic-1.jpg, wb) → `{jobs:[{id}]}` → редирект в студию.
- `GET /demo` → 307 → `/studio/<id>` (демо-джоба из `fixtures/photos/synthetic-1.jpg`, wb). До T9 hero ссылался на несуществующий `/demo` → 404.
- Полный пайплайн по HTTP (`/api/jobs/<id>/step` ×7): `score=100`, `identity=0.944`, `status=done`, checklist и copy на месте (wb + synthetic-1).
- `GET /api/jobs/<id>/export` → 200, `cardTxt` с title/specs; `GET /asset/main.jpg` (62 КБ), `/asset/mask.png`, `/asset/source` — все 200.
- `GET /studio/<id>`, `GET /r/<id>`, `GET /batch` → 200.
- Негативы: неизвестная джоба → 404 с человеческим текстом; `rules` до `compose` → 409 + `missing:["compose","whitebg"]`; левый шаг → 400 со списком доступных.
- `pnpm build` — чисто, все роуты в таблице. `pnpm evals --mock` — 20/20 совпало с expect, средний score 94.0. `check:rules`, `check:copy-export`, `check:identity` — без регрессий.
- `any`/`@ts-ignore` в файлах T9 — ноль совпадений.

## Найденные баги и что с ними

| # | Баг | Статус |
|---|---|---|
| 1 | `app/studio/[id]` — заглушка `<h1>studio {id}</h1>`, экрана прогона не было | Починен: `components/studio/studio-runner.tsx` (шаги, до/после, чек-лист с fix, метрики, `ResultActions`, ссылка на `/r`) |
| 2 | Hero «Посмотреть готовый пример» → `/demo` → 404 (роута не было) | Починен: `app/demo/page.tsx` создаёт wb-джобу из synthetic-1.jpg и редиректит в студию |
| 3 | Лендинг: кнопка disabled + текст «появятся в следующих задачах» (устарело с T1) | Починен: отправка первого фото в `POST /api/jobs` + переход в студию; ссылка на батч для каталога |
| 4 | `/api/health` врал `mock:false` без ключа (читал `process.env` напрямую) | Починен: через `isMock()` из `lib/env` |
| 5 | `/api/stats` всегда `{0,0,0}` | Починен: считает джобы/cards/кредиты/score по `job.json` на диске |
| 6 | `.env.example` с `MODEL_API_KEY=***` (не пустой) | Починен: пустой ключ + комментарий про MOCK |
| 7 | `studio-runner` тянул `node:fs` в клиентский бандл через `export.ts` (build падал `UnhandledSchemeError`) | Починен: схемы уехали в клиент-безопасный `lib/pipeline/export-schema.ts`, `copySchema` — в `lib/pipeline/types.ts`; `export.ts`/`copy.ts` реэкспортируют, старые импорты живы |
| 8 | `amazon` на синтетике красный только по `fill` (0.633 < 0.85, score 80) | Не баг: честный красный пункт с замером и fix; зафиксирован в evals как expect=fail |
| 9 | `synthetic-3+wb`: identity 0.887 < 0.90 (pHash плывёт на ресемплинге) | Не баг: порог не тронут, кейсы зафиксированы как fail-регрессия (см. HANDOFF T8) |

## Известные ограничения (не чинили — вне зоны T9)

- Нет отдельных `GET /api/rules/<mp>` и `POST /api/demo` из структуры MASTER §4: UI их не использует (регламент едят движок и eval-стенд, демо — через `app/demo`). Кандидаты на следующий проход, на демо не влияют.
- Нет `fixtures/demo/` с заранее посчитанной джобой: демо собирается вживую через mock за ~10 с — для видео ок, ссылку судьи откроют свою.
- `webapp-testing` (Playwright-скриншоты) не гонялся — стенда нет в зависимостях (запрет стеком); вместо него — полный HTTP-прогон выше.
- Деплой на Vercel — руками (доступов из этой машины нет): `pnpm build` чистый, все роуты `nodejs + force-dynamic`, sharp в `serverExternalPackages`.
