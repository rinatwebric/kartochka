# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T5 выполнен 30.10.2026. Движок регламента готов: `pnpm check:rules` — wb/ozon PASS 100, amazon FAIL 55 (aspect/min_size/fill, ожидаемо), плохой кадр ловится (not_cropped + no_text_on_main), временный rules/test.json работает без правки кода; `pnpm build` — Compiled successfully; `pnpm check:pipeline` и `pnpm check:identity` — без регрессий. Следующая задача — T6 (текст карточки и экспорт, MASTER.md разделы 5 и 9).

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

## Что дальше
T6: текст карточки и экспорт (MASTER.md разделы 5 и 9; скилл frontend-design для блока экспорта). Задел: rules пишет пункты с id/label/measured/weight/fix/reason и metrics.compliance/score — checklist и fix-hints в UI берут их как есть; финалы `<src>.main.white.png` + маски лежат в assets.

## Открытые вопросы
- Живой ответ sam-3.1 (special-token маски) не виден без ключа — ветка `sam-mask` написана вслепую по DECISIONS T2 и отработает только при совпадении формата; первый живой прогон делать осторожно, смотреть `method` в отчёте.
- Живой `muse-glimmer` через Model API, скорее всего, вернёт 404 (self-host) — в T4 judge идёт на тот же base URL, в mock всегда same=true 3/3; честная строка для README — в DECISIONS.
- Детерминированный compose самозалечивает подмену (рекомпоз из source всегда same), поэтому петля в стенде на persistent-провале симулируется `IDENTITY_FORCE_FAIL=1` (иначе mock-glimmer не отличить).
- `pnpm lint` (next lint) не прогонялся; `pnpm build` проходит без ошибок типов.
- На что смотреть: mock-боксы sam фиксированы (0.25,0.15,0.5,0.7) — fill после compose всегда 0.633 на синтетике; разнообразие даст только живой SAM или фото с другим фоном под bg-removal.
