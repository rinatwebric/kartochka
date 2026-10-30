# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T9 выполнен 30.10.2026. QA-прогон в mock без ключа — всё зелёное (лендинг→студия, /demo, 7 шагов score 100 identity 0.944, экспорт/ассеты, /r, батч, health/stats, негативы 404/409/400); критичные баги починены (студия-заглушка, /demo 404, disabled-кнопка, враньё health/stats, node:fs в клиентском бандле); README, docs/VIDEO.md, docs/QA.md написаны; `pnpm build` чистый; `pnpm evals --mock` — 20/20 (средний score 94.0); регрессии без изменений; `any|@ts-ignore` в файлах T9 — ноль. Деплой на Vercel — вручную (доступов с этой машины нет). Следующая задача — сабмит: видео по docs/VIDEO.md, пост в X, отправка до вечера 03.11.

## Что готово
- T1 (лендинг), T2 (клиент моделей + MOCK) без изменений: собираются, `pnpm tsx scripts/check-models.ts` по-прежнему ок.
- `lib/pipeline/types.ts`: +zod-схемы `inspectMetricsSchema`, `bboxSchema`/`samBoxSchema`, `segmentResultSchema` (method: sam-mask|sam-boxes|background-removal), `composeResultSchema` (modelUsed), `whitebgResultSchema` (bgWhite, changedInside, edgePreserved, rolledBack). Старые `JobState`/`Metrics`/`ChecklistItem` не тронуты.
- `lib/utils/image.ts`: sharp-хелперы `readRaw`, `readGrayscaleRaw`, `decodeImageResult` (b64 или URL), `backgroundColorFromBorders` (медиана рамки), `assertChannels` (сужение 1|2|3|4 без any).
- `lib/pipeline/inspect.ts`: размеры/aspect/sharpness (дисперсия лапласиана через convolve) + касание краёв по маске (опц.); `SHARPNESS_WARN_BELOW=20` — только warn, см. DECISIONS.
- `lib/pipeline/segment.ts`: `segmentWithSam` + цепочка sam-mask→sam-boxes→background-removal; сейв `<src>.mask.png`; bg-removal проверен точечно — bbox пиксель-в-пиксель по синтетике.
- `lib/pipeline/compose.ts`: детерминированный коллаж на холст из `rules/<mp>.json` (дефолт 900x1200), fill = середина диапазона площадки; сейв `<src>.main.jpg` + `<src>.main.mask.png` (инверсный маппинг маски, без дыр); `modelUsed=false` (вариант B, см. DECISIONS).
- `lib/pipeline/whitebg.ts`: эрозия 2px, всё вне → ровно 255,255,255, выход PNG; `changedInside>0.02` или вырожденная маска → откат к предыдущему кадру + `rolledBack=true`.
- `lib/pipeline/state.ts`: Map + `os.tmpdir()/jobs/<id>/job.json`, `createJob/loadJob/saveJob`, `readStepResult/writeStepResult`, `StepError` (404/409/500, `missing[]`).
- `lib/pipeline/runner.ts`: `runStep(job, step)` для inspect→segment→compose→whitebg→identity: prereq-409, тайминг, дельта кредитов, `job.json`; повтор перезаписывает; шаги T5+ → 409 «не реализован».
- `scripts/check-pipeline.ts` (+`pnpm check:pipeline`): генерация 3 synthetic-jpg при пустой `fixtures/photos`, прогон через runner, печать size/fill/bg_white/edge/method/ms/credits, assert fill∈[0.6,0.9] и bg_white≥0.99, exit 1 при провале.
- `.gitignore`: `*.mask.png`, `*.main.jpg`, `*.white.png` — в `fixtures/photos` коммитим только `synthetic-*.jpg`.
- `docs/DECISIONS.md`: +6 строк T3 (вариант B, цепочка маски, target fill, sharpness-порог, эрозия/откат, tmpdir, игнор артефактов).
- Проверка: `pnpm check:pipeline` — 3/3 PASS; `pnpm build` — Compiled successfully, типы ок; grep по `any|@ts-ignore` в `lib/` — пусто.
- T4: `lib/utils/phash.ts` (DCT 32x32→8x8, медиана по 63 AC, bigint-hex, hamming 0..64), `lib/utils/hsv.ts` (H16/S4/V4=256, Пирсон), `lib/utils/ssim.ts` (настоящий SSIM, окно 8x8 на 256, `ssimOnMask` по покрытию >50%).
- T4: `lib/pipeline/identity.ts` (формула 0.35/0.25/0.25/0.15, порог 0.90; кропы по bbox с инсетом 3%; glimmer 3 голоса; `IDENTITY_FORCE_FAIL=1`; `identityResultSchema`).
- T4: петля в runner (identity<0.90 → до 2 ретраев `compose-v2-enhanced`, `attempts.identity`, `metrics.retries`, красный checklist); `scripts/check-identity.ts` + `pnpm check:identity` (same 0.9441 PASS, substituted 0.5425 FAIL-ожидаемо, loop retries=2).
- T5: `lib/pipeline/rules.ts` (пороги только из rules/*.json; кодовые типы pixels_white/aspect/min_size/fill/not_cropped; vision-типы no_text_on_main/no_watermark/single_object через `askSpark` строгим JSON {ok,confident,bbox,reason}, без уверенности — честный провал, mock — детерминированный pass; `evaluateMarketplace`/`summarize`/`checkMarketplace`/`judgeAllVision`/`checkRules(jobId)`; compliance = веса пройденных/все, score = round(*100)).
- T5: шаг `rules` в runner (замеры из compose+whitebg+maskTouchesBorders, vision по финальному кадру, пишет metrics.compliance/score + checklist, статус done); `scripts/check-rules.ts` + `pnpm check:rules` (таблица пункт/замер/ок, кейс «Ozon PASS / Amazon FAIL», временный rules/test.json без правки кода, exit 1 при расхождении).
- T6: `lib/pipeline/copy.ts` (muse-spark строгим JSON по финальному кадру, лимиты только из rules limits, запрет «идеальн*», нормализация + `validateCopy`, mock-фикстура, `formatCardTxt`, `COPY_PROMPT_ID=copy-v1`); шаг `copy` в runner (409 без него у export, статус done, идемпотентен); `lib/pipeline/export.ts` (`buildExportPayload`/`buildCardJson`/`buildChecklistJson`, `EXPORT_FILES` из 5 имён); `app/api/jobs/[id]/export/route.ts` + `app/api/jobs/[id]/asset/[name]/route.ts` (nodejs, force-dynamic, whitelist main.jpg/mask.png/source); `lib/utils/zip.ts` (`buildZip` через jszip, проверка дублей/пустоты); `components/studio/result-actions.tsx` (клиентский `ResultActions`: «Скачать ZIP» с блокировкой кнопки + `slugifyTitle` с транслитом, «Скопировать текст» с состоянием 2 с, ошибки человеческим текстом); `scripts/check-copy-export.ts` + `pnpm check:copy-export` (16/16 PASS).
- T7: `app/api/jobs/route.ts` (POST FormData files+marketplace → по джобе на файл, лимиты 20 файлов/15 МБ), `app/api/jobs/[id]/route.ts` (GET состояние), `app/api/jobs/[id]/step/route.ts` (POST {step} → runStep, StepError→статус); `app/batch/page.tsx` (клиентский оркестратор: создание джоб, последовательный прогон 7 шагов с шагом-меткой, таблица, «Скачать всё» — один ZIP с папками `NN-slug/`); `components/batch/batch-table.tsx` + `batch-summary.tsx` (презентация; «пройдёт» = done без красных пунктов); `lib/utils/slug.ts` (транслит для архива); `app/r/[id]/page.tsx` (read-only: кадр, чек-лист с замерами/fix, текст, «сделано в КАРТОЧКА за N с и M кредитов», 404 на неизвестный id; схема экспорта в батче локальная — полный модуль тянет node:fs в клиентский бандл).

 ## Что дальше
Сабмит (руками): задеплоить на Vercel (`pnpm build` чистый, рантаймы nodejs+force-dynamic, sharp в serverExternalPackages), снять видео по docs/VIDEO.md, пост в X с до/после, отправить до вечера 03.11 (дедлайн 04.11 21:00 ET). Кандидаты на следующий проход (не блокеры демо): `GET /api/rules/<mp>` и `POST /api/demo` из структуры MASTER §4, `fixtures/demo/` с предсчитанной джобой.

## T9 (готово 30.10.2026)
- Студия: `components/studio/studio-runner.tsx` (шаги, до/после, чек-лист с fix, метрики, `ResultActions`, ссылка на `/r`) + серверная обёртка `app/studio/[id]/page.tsx` (была заглушка); лендинг проводка: `Dropzone onFiles` + активная «Собрать карточку» → `POST /api/jobs` → студия; новый `app/demo/page.tsx` (джоба из synthetic-1.jpg → редирект в студию, чинит 404 hero-ссылки).
- Правдивые API: `health` через `isMock()` (без ключа `mock:true`), `stats` считает джобы/cards/кредиты/score по `job.json` (были нули); `.env.example` — пустой ключ + MOCK-комментарий.
- Развязка бандла: `lib/pipeline/export-schema.ts` (только zod, для клиента), `copySchema` переехала в `lib/pipeline/types.ts`, `copy.ts`/`export.ts` реэкспортируют — старые импорты живы, `check:*` зелёные.
- Доки: README (запуск, MOCK, таблица моделей, what-built, ограничения, ссылки), `docs/VIDEO.md` (3:00 по секундам), `docs/QA.md` (HTTP-прогон без ключа + таблица багов); свежий eval-отчёт `evals/report/20261030-125803-mock-v1.*` закоммичен.
- Проверка: `pnpm build` чистый; `evals --mock` 20/20 (score 94.0); HTTP в mock: 7 шагов score 100/identity 0.944, export+asset 200, негативы 404/409/400; `any|@ts-ignore` — ноль.

## T8 (готово 30.10.2026)
- `lib/prompts/registry.ts` (+`v1.ts`, `v2.ts`): наборы промптов с `id`, версия из `PROMPT_VERSION` (дефолт v1); все вызовы моделей берут текст и id из реестра: segment (промпт категории), identity (judge-промпт + `promptId`), rules (vision-промпты), copy (билдер + `copyId`); `promptIds` в `job.json` и отчёте стенда.
- `evals/cases.json`: 20 кейсов (7 wb pass, 7 ozon pass, 6 amazon fail, 2 wb fail-регрессии identity) на 3 synthetic-фикстурах, в каждом note пометка про синтетику и замер.
- `evals/run.ts` (+`pnpm evals` = `tsx evals/run.ts`): режимы mock/live (live требует ключ), `--version`, `--compare v1 v2`; отчёт `<дата>-<режим>-<версия>.json` + `.csv` (строка на кейс: score/compliance/identity/credits/promptIds/failedChecks), сводка в консоль, exit 0 при полном прогоне.
- Находки стенда: synthetic-3+wb identity 0.887<0.90 (pHash-плывун на ресемплинге, SSIM 0.987) — порог не тронут, кейсы wb-03/wb-06 зафиксированы как fail; amazon красный только по fill (score 80).

## Открытые вопросы
- Живой ответ sam-3.1 (special-token маски) не виден без ключа — ветка `sam-mask` написана вслепую по DECISIONS T2 и отработает только при совпадении формата; первый живой прогон делать осторожно, смотреть `method` в отчёте.
- Живой `muse-glimmer` через Model API, скорее всего, вернёт 404 (self-host) — в T4 judge идёт на тот же base URL, в mock всегда same=true 3/3; честная строка для README — в DECISIONS.
- Детерминированный compose самозалечивает подмену (рекомпоз из source всегда same), поэтому петля в стенде на persistent-провале симулируется `IDENTITY_FORCE_FAIL=1` (иначе mock-glimmer не отличить).
- `pnpm lint` (next lint) не прогонялся; `pnpm build` проходит без ошибок типов.
- На что смотреть: mock-боксы sam фиксированы (0.25,0.15,0.5,0.7) — fill после compose всегда 0.633 на синтетике; разнообразие даст только живой SAM или фото с другим фоном под bg-removal.
