# HANDOFF — передача контекста между чатами

Обновляется агентом в конце КАЖДОЙ задачи. Следующий чат начинается с чтения этого файла.

## Текущее состояние
T2 выполнен 30.10.2026. Клиент моделей + MOCK готов: `pnpm build` — Compiled successfully, `pnpm tsx scripts/check-models.ts` — все четыре обёртки отвечают в mock-режиме с логом `[model]`. Следующая задача — T3 (inspect + segment + compose + whitebg).

## Что готово
- T1 (лендинг) без изменений: собирается, `/` отдаёт 200.
- `lib/env.ts`: zod-валидация `MODEL_API_KEY` (optional), `META_BASE_URL` (default `https://api.meta.ai/v1`), `MOCK` (`"0"|"1"`, default `"1"`); без ключа MOCK принудительно `"1"`; экспорт `env`, `getEnv`, `isMockEnv`, `isMock`. Пустые строки env считаются отсутствующими.
- `lib/models/meta.ts`: единый клиент `callMeta` — POST JSON, AbortController-таймаут 60 с, 2 ретрая с экспоненциальной паузой (500·2^n мс) только на 429/5xx и сетевые ошибки, на 4xx бросает сразу; лог одной строкой `[model] name=... ms=... credits=... status=...`; счётчик кредитов (`MODEL_CREDIT_COST`: sam 1, image 5, spark 1, contributor 0.5, glimmer 0; `getCreditsTotal`/`resetCreditsTotal`); типизированная `ModelError` с человеческим текстом RU; `shouldRetry` экспортирован для тестов.
- `lib/models/types.ts`: zod-схемы `textVerdictSchema`, `imageResultSchema` (b64 или URL, refine требует хотя бы одно), `samResultSchema` (raw + boxes + mask), `responsesApiSchema`, `imagesApiSchema` — поля сверены с https://dev.meta.ai/docs.
- Обёртки: `sam.ts` (`segmentWithSam(image, prompt)`, модель `sam-3.1` через `/v1/responses`), `image.ts` (`generateImage({prompt,image?,size?})`, без image — `/images/generations`, с image — `/images/edits` JSON-форма `images:[{image_url}]`), `spark.ts` (`askSpark(prompt, image?)`, `muse-spark-1.3`), `glimmer.ts` (`judgeIdentity(prompt, image?)`, `muse-glimmer`, просит строгий JSON и валидирует). В MOCK все делегируют в `lib/mock/provider.ts`.
- `lib/mock/`: детерминированные фикстуры (1x1 белый PNG base64, фиксированные текст и вердикт same=true), задержка 300–800 мс, ошибок не бросает; mock-вызовы пишут тот же однострочный лог со `status=mock` и оценочными кредитами.
- `scripts/check-models.ts`: форсирует MOCK до импорта env (динамические импорты), прогоняет все четыре обёртки, печатает результаты и `credits total`. Запуск: `pnpm tsx scripts/check-models.ts`.
- `pnpm-workspace.yaml`: `allowBuilds: esbuild, sharp` (pnpm 12 требует `approve-builds`; stale-поле `pnpm.onlyBuiltDependencies` в package.json оставлено нетронутым — только ворнинг).
- `docs/DECISIONS.md`: +4 строки (tsx; сверка полей с документацией; Glimmer self-host; SAM special-token вывод).
- Проверка: `pnpm build` — Compiled successfully, типы ок, 7 роутов; `pnpm tsx scripts/check-models.ts` — sam/image/spark/glimmer ответили, в логе ms и credits; grep по `any|@ts-ignore` в `lib/` — пусто.

## Что дальше
T3: inspect + segment + compose + whitebg (MASTER.md разделы 5, 7, 8; скилл test-driven-development). Декод SAM-маски из special-token текста в пиксели — делать в T3 (см. DECISIONS про docs/sam/client-libraries). Живой прогон обёрток не проверялся (нет ключа) — первый живой вызов делать осторожно, с MOCK=0 и валидным ключом.

## Открытые вопросы
- Живой ответ sam-3.1 (формат special-token боксов/масок) не виден без ключа — парсинг `boxes` из `raw` пока не реализован, `SamResult.boxes` заполняется только в mock.
- Живой вызов `muse-glimmer` через Model API, скорее всего, вернёт 404 (self-host модель) — нужен локальный рантайм или замена судьи; решение за T4.
- `pnpm lint` (next lint) не прогонялся; `pnpm build` проходит без ошибок типов.
- На что смотреть: mock-фикстура картинки — 1x1 PNG, для визуальной проверки непригодна, только для plumbing; `credits total=0` в mock — деньги не тратятся, в лог пишутся оценочные кредиты.
