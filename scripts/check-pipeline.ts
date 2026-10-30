// Проверка T3: прогоняет inspect->segment->compose->whitebg через runner
// на всех фото из fixtures/photos/ и печатает метрики по каждому файлу.
// Запуск: pnpm check:pipeline (или pnpm tsx scripts/check-pipeline.ts).
// В mock-режиме работает без ключа. Пустая папка -> 3 synthetic-jpg via sharp.
process.env.MOCK = "1";
delete process.env.MODEL_API_KEY;

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PHOTOS_DIR = join(process.cwd(), "fixtures", "photos");
const FILL_MIN = 0.6;
const FILL_MAX = 0.9;
const BG_WHITE_MIN = 0.99;

function isSourcePhoto(name: string): boolean {
  if (name === ".gitkeep") return false;
  if (name.includes(".mask.") || name.includes(".main.") || name.includes(".white.")) return false;
  return /\.(jpe?g|png)$/i.test(name);
}

interface SyntheticSpec {
  name: string;
  bg: { r: number; g: number; b: number };
  svg: string;
}

const SYNTHETICS: SyntheticSpec[] = [
  {
    name: "synthetic-1.jpg",
    bg: { r: 186, g: 181, b: 172 },
    svg: `<svg width="900" height="1200"><ellipse cx="450" cy="920" rx="230" ry="36" fill="rgb(140,135,126)" opacity="0.6"/><rect x="270" y="330" width="360" height="540" rx="60" fill="rgb(176,44,44)"/></svg>`,
  },
  {
    name: "synthetic-2.jpg",
    bg: { r: 214, g: 203, b: 182 },
    svg: `<svg width="900" height="1200"><ellipse cx="450" cy="880" rx="300" ry="34" fill="rgb(170,160,142)" opacity="0.6"/><circle cx="450" cy="560" r="260" fill="rgb(38,68,140)"/></svg>`,
  },
  {
    name: "synthetic-3.jpg",
    bg: { r: 198, g: 206, b: 214 },
    svg: `<svg width="900" height="1200"><ellipse cx="450" cy="1050" rx="180" ry="30" fill="rgb(150,158,168)" opacity="0.6"/><rect x="330" y="180" width="240" height="840" rx="40" fill="rgb(36,130,84)"/><rect x="330" y="180" width="240" height="90" rx="40" fill="rgb(24,88,58)"/></svg>`,
  },
];

async function ensureSynthetics(): Promise<string[]> {
  const made: string[] = [];
  for (const spec of SYNTHETICS) {
    const out = join(PHOTOS_DIR, spec.name);
    await sharp({ create: { width: 900, height: 1200, channels: 3, background: spec.bg } })
      .composite([{ input: Buffer.from(spec.svg), left: 0, top: 0 }])
      .jpeg({ quality: 90 })
      .toFile(out);
    made.push(out);
  }
  return made;
}

async function main(): Promise<void> {
  const { getCreditsTotal, resetCreditsTotal } = await import("../lib/models/meta");
  const { createJob } = await import("../lib/pipeline/state");
  const { runStep } = await import("../lib/pipeline/runner");
  const { readStepResult } = await import("../lib/pipeline/state");
  const { inspectMetricsSchema, composeResultSchema, whitebgResultSchema, segmentResultSchema } =
    await import("../lib/pipeline/types");

  let entries: string[] = [];
  try {
    entries = (await readdir(PHOTOS_DIR)).filter(isSourcePhoto);
  } catch {
    entries = [];
  }
  let files = entries.map((n) => join(PHOTOS_DIR, n));
  if (files.length === 0) {
    console.log("fixtures/photos пуста — генерирую 3 synthetic-jpg через sharp.");
    files = await ensureSynthetics();
  }

  let failed = 0;
  for (const file of files) {
    const name = file.split(/[\\/]/).pop() ?? file;
    resetCreditsTotal();
    const started = Date.now();
    try {
      let job = await createJob("wb", file);
      job = await runStep(job, "inspect");
      job = await runStep(job, "segment");
      job = await runStep(job, "compose");
      job = await runStep(job, "whitebg");
      const ms = Date.now() - started;
      const credits = getCreditsTotal();
      const inspect = inspectMetricsSchema.parse(await readStepResult(job.id, "inspect"));
      const segment = segmentResultSchema.parse(await readStepResult(job.id, "segment"));
      const compose = composeResultSchema.parse(await readStepResult(job.id, "compose"));
      const whitebg = whitebgResultSchema.parse(await readStepResult(job.id, "whitebg"));
      const fillOk = compose.fill >= FILL_MIN && compose.fill <= FILL_MAX;
      const bgOk = whitebg.bgWhite >= BG_WHITE_MIN;
      const edgeOk = whitebg.edgePreserved && !whitebg.rolledBack;
      const ok = fillOk && bgOk && edgeOk && job.status === "done";
      if (!ok) failed += 1;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${name} | ${compose.width}x${compose.height}` +
          ` | fill=${compose.fill.toFixed(3)}${fillOk ? "" : "(!)"}` +
          ` | bg_white=${whitebg.bgWhite.toFixed(4)}${bgOk ? "" : "(!)"}` +
          ` | edge=${whitebg.edgePreserved ? "ok" : "EATEN"}${whitebg.rolledBack ? "+rollback" : ""}` +
          ` | seg=${segment.method}` +
          ` | src=${inspect.width}x${inspect.height} sharp=${inspect.sharpness.toFixed(1)}` +
          ` | ms=${ms} | credits=${credits}`,
      );
    } catch (err) {
      failed += 1;
      const ms = Date.now() - started;
      console.log(`FAIL ${name} | error=${err instanceof Error ? err.message : err} | ms=${ms}`);
    }
  }
  console.log(`files=${files.length} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
