# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T3 выполнен 30.10.2026. Ядро продукта готово: `pnpm check:pipeline` — 3/3 PASS в mock-режиме без ключа (fill=0.633, bg_white=1.0000, edge=ok, ~700 мс/файл, 0 кредитов), `pnpm build` — Compiled successfully. Следующая задача — T4 (identity gate + петля ретраев).

## Что готово
- T1 (лендинг), T2 (клиент моделей + MOCK) без изменений: собираются, `pnpm tsx scripts/check-models.ts` по-прежнему ок.
- `lib/pipeline/types.ts`: +zod-схемы `inspectMetricsSchema`, `bboxSchema`/`samBoxSchema`, `segmentResultSchema` (method: sam-mask|sam-boxes|background-removal), `composeResultSchema` (modelUsed), `whitebgResultSchema` (bgWhite, changedInside, edgePreserved, rolledBack). Старые `JobState`/`Metrics`/`ChecklistItem` не тронуты.
- `lib/utils/image.ts`: sharp-хелперы `readRaw`, `readGrayscaleRaw`, `decodeImageResult` (b64 или URL), `backgroundColorFromBorders` (медиана рамки), `assertChannels` (сужение 1|2|3|4 без any).
- `lib/pipeline/inspect.ts`: размеры/aspect/sharpness (дисперсия лапласиана через convolve) + касание краёв по маске (опц.); `SHARPNESS_WARN_BELOW=20` — только warn, см. DECISIONS.
- `lib/pipeline/segment.ts`: `segmentWithSam` + цепочка sam-mask→sam-boxes→background-removal; сейв `<src>.mask.png`; bg-removal проверен точечно — bbox пиксель-в-пиксель по синтетике.
- `lib/pipeline/compose.ts`: детерминированный коллаж на холст из `rules/<mp>.json` (дефолт 900x1200), fill = середина диапазона площадки; сейв `<src>.main.jpg` + `<src>.main.mask.png` (инверсный маппинг маски, без дыр); `modelUsed=false` (вариант B, см. DECISIONS).
- `lib/pipeline/whitebg.ts`: эрозия 2px, всё вне → ровно 255,255,255, выход PNG; `changedInside>0.02` или вырожденная маска → откат к предыдущему кадру + `rolledBack=true`.
- `lib/pipeline/state.ts`: Map + `os.tmpdir()/jobs/<id>/job.json`, `createJob/loadJob/saveJob`, `readStepResult/writeStepResult`, `StepError` (404/409/500, `missing[]`).
- `lib/pipeline/runner.ts`: `runStep(job, step)` для inspect→segment→compose→whitebg: prereq-409, тайминг, дельта кредитов, `job.json`; повтор перезаписывает; шаги T4+ → 409 «не реализован».
- `scripts/check-pipeline.ts` (+`pnpm check:pipeline`): генерация 3 synthetic-jpg при пустой `fixtures/photos`, прогон через runner, печать size/fill/bg_white/edge/method/ms/credits, assert fill∈[0.6,0.9] и bg_white≥0.99, exit 1 при провале.
- `.gitignore`: `*.mask.png`, `*.main.jpg`, `*.white.png` — в `fixtures/photos` коммитим только `synthetic-*.jpg`.
- `docs/DECISIONS.md`: +6 строк T3 (вариант B, цепочка маски, target fill, sharpness-порог, эрозия/откат, tmpdir, игнор артефактов).
- Проверка: `pnpm check:pipeline` — 3/3 PASS; `pnpm build` — Compiled successfully, типы ок; grep по `any|@ts-ignore` в `lib/` — пусто.

## Что дальше
T4: identity gate и петля ретраев (MASTER.md раздел 8; скиллы test-driven-development, systematic-debugging). Задел из T3: `compose.main.mask.png` в координатах кадра — под SSIM по маске; `attempts.compose/identity` уже считаются в runner.

## Открытые вопросы
- Живой ответ sam-3.1 (special-token маски) не виден без ключа — ветка `sam-mask` написана вслепую по DECISIONS T2 и отработает только при совпадении формата; первый живой прогон делать осторожно, смотреть `method` в отчёте.
- Живой `muse-glimmer` через Model API, скорее всего, вернёт 404 (self-host) — решение за T4.
- `pnpm lint` (next lint) не прогонялся; `pnpm build` проходит без ошибок типов.
- На что смотреть: mock-боксы sam фиксированы (0.25,0.15,0.5,0.7) — fill после compose всегда 0.633 на синтетике; разнообразие даст только живой SAM или фото с другим фоном под bg-removal.
