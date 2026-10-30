// Проверка T6: полный прогон inspect→…→rules→copy в mock-режиме,
// экспорт и клиентская сборка ZIP ровно из пяти файлов.
// Запуск: pnpm check:copy-export (или pnpm tsx scripts/check-copy-export.ts).
// Работает без ключа. Проверяет и лимиты текста по rules всех трёх площадок.
process.env.MOCK = "1";
delete process.env.MODEL_API_KEY;

import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

const EXPECTED_ZIP_FILES = ["main.jpg", "mask.png", "card.json", "card.txt", "checklist.json"];

async function makeSyntheticSource(): Promise<string> {
  const out = join(tmpdir(), `t6-source-${Date.now()}.jpg`);
  const svg = `<svg width="900" height="1200"><rect x="270" y="330" width="360" height="540" rx="60" fill="rgb(176,44,44)"/></svg>`;
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 186, g: 181, b: 172 } } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toFile(out);
  return out;
}

async function main(): Promise<void> {
  const { createJob, readStepResult } = await import("../lib/pipeline/state");
  const { runStep } = await import("../lib/pipeline/runner");
  const { readCopyLimits, splitSentences, validateCopy } = await import("../lib/pipeline/copy");
  const { buildExportPayload, buildExportFiles, EXPORT_FILES } = await import("../lib/pipeline/export");
  const { buildZip } = await import("../lib/utils/zip");
  const { composeResultSchema } = await import("../lib/pipeline/types");

  let failed = 0;
  const note = (cond: boolean, msg: string): void => {
    console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
    if (!cond) failed += 1;
  };

  // 1. Лимиты читаются из rules всех трёх площадок, без выдуманных чисел.
  for (const mp of ["wb", "ozon", "amazon"] as const) {
    const limits = await readCopyLimits(mp);
    note(limits.titleMax > 0 && limits.descriptionMax > 0, `${mp}: limits title_max=${limits.titleMax} description_max=${limits.descriptionMax}`);
  }
  note(
    EXPORT_FILES.join(",") === EXPECTED_ZIP_FILES.join(","),
    `состав архива зафиксирован: ${EXPORT_FILES.join(", ")}`,
  );

  // 2. Полный прогон до copy на синтетике.
  const source = await makeSyntheticSource();
  let job = await createJob("wb", source);
  const jobId = job.id;
  for (const step of ["inspect", "segment", "compose", "whitebg", "identity", "rules", "copy"] as const) {
    job = await runStep(job, step);
  }
  note(job.status === "done", `статус после copy: ${job.status}`);
  note(job.promptIds.copy === "copy-v1", `promptId copy зафиксирован: ${job.promptIds.copy}`);

  const limits = await readCopyLimits("wb");
  const errors = validateCopy(job.copy, limits);
  note(errors.length === 0, `copy валиден по лимитам wb (title ${job.copy.title.length}/${limits.titleMax})`);
  if (errors.length > 0) console.log(`  ошибки: ${errors.join("; ")}`);
  const sentences = splitSentences(job.copy.description);
  note(sentences.length >= 3 && sentences.length <= 5, `описание: ${sentences.length} предложений (нужно 3-5)`);
  note(!/идеальн/iu.test(`${job.copy.title} ${job.copy.description}`), "без запрещённого «идеальный»");
  const specsCount = Object.keys(job.copy.specs).length;
  note(specsCount >= 5 && specsCount <= 8, `характеристик: ${specsCount} (нужно 5-8)`);

  // 3. Повтор copy идемпотентен.
  const rerun = await runStep(job, "copy");
  note(rerun.copy.title === job.copy.title, "повтор copy перезаписывает тот же результат");

  // 4. Экспорт + ZIP ровно из пяти файлов.
  const payload = await buildExportPayload(jobId);
  const files = buildExportFiles({
    id: payload.id,
    marketplace: payload.marketplace,
    copy: payload.copy,
    checklist: payload.checklist,
    compliance: payload.compliance,
    score: payload.score,
    promptIds: payload.promptIds,
  });
  const compose = composeResultSchema.parse(await readStepResult(jobId, "compose"));
  if (job.assets.main === undefined) {
    console.log("FAIL главный кадр отсутствует в job.assets.main");
    process.exit(1);
  }
  const mainBytes = new Uint8Array(await readFile(job.assets.main));
  const maskBytes = payload.assets.mask === null ? null : new Uint8Array(await readFile(compose.maskPath));
  const encoder = new TextEncoder();
  const zipInputs: Array<{ name: string; data: Uint8Array }> = [
    { name: "main.jpg", data: mainBytes },
  ];
  if (maskBytes !== null) zipInputs.push({ name: "mask.png", data: maskBytes });
  zipInputs.push(
    { name: "card.json", data: encoder.encode(files.cardJson) },
    { name: "card.txt", data: encoder.encode(files.cardTxt) },
    { name: "checklist.json", data: encoder.encode(files.checklistJson) },
  );
  const order = new Map(EXPECTED_ZIP_FILES.map((name, i) => [name, i]));
  zipInputs.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));

  const blob = await buildZip(zipInputs);
  note(blob.size > 0, `buildZip собрал архив (${blob.size} байт)`);
  const loaded = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(loaded.files).sort();
  note(
    names.join(",") === [...EXPECTED_ZIP_FILES].sort().join(","),
    `внутри ZIP ровно пять файлов: ${names.join(", ")}`,
  );
  const cardJson = JSON.parse((await loaded.files["card.json"]?.async("string")) ?? "null") as unknown;
  note(
    typeof cardJson === "object" && cardJson !== null && (cardJson as { title?: unknown }).title === job.copy.title,
    "card.json хранит тот же title, что job.copy",
  );
  const cardTxt = (await loaded.files["card.txt"]?.async("string")) ?? "";
  note(cardTxt.includes(job.copy.title) && cardTxt.includes(job.copy.description), "card.txt содержит title и description");

  // 5. Пустой copy не экспортируется (409, а не пустой архив).
  const empty = await createJob("ozon", source);
  let rejected = false;
  try {
    await buildExportPayload(empty.id);
  } catch (err) {
    rejected = err instanceof Error && /copy/.test(err.message);
  }
  note(rejected, "export без copy отклоняется с понятной ошибкой");

  console.log(`failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
