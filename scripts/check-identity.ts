// Проверка T4: identity на том же кадре (>= 0.90) и на подменённом похожим
// (< 0.90), плюс петля ретраев (при persistent-провале в состоянии 2 ретрая).
// Запуск: pnpm check:identity. В mock-режиме работает без ключа.
process.env.MOCK = "1";
delete process.env.MODEL_API_KEY;

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PHOTOS_DIR = join(process.cwd(), "fixtures", "photos");

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
    svg: `<svg width="900" height="1200"><ellipse cx="450" cy="920" rx="230" ry="36" fill="rgb(140,135,142)" opacity="0.6"/><rect x="270" y="330" width="360" height="540" rx="60" fill="rgb(176,44,44)"/></svg>`,
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
  const { createJob, readStepResult } = await import("../lib/pipeline/state");
  const { runStep } = await import("../lib/pipeline/runner");
  const { computeIdentity } = await import("../lib/pipeline/identity");
  const { segmentResultSchema, composeResultSchema, whitebgResultSchema } =
    await import("../lib/pipeline/types");
  const { identityResultSchema } = await import("../lib/pipeline/identity");

  let entries: string[] = [];
  try {
    entries = (await readdir(PHOTOS_DIR)).filter(isSourcePhoto);
  } catch {
    entries = [];
  }
  let files = entries.map((n) => join(PHOTOS_DIR, n));
  if (files.length < 2) {
    console.log("fixtures/photos: мало фото — генерирую 3 synthetic-jpg через sharp.");
    files = await ensureSynthetics();
  }
  const sourceA = files.find((f) => f.includes("synthetic-1")) ?? files[0] ?? "";
  const sourceB = files.find((f) => f.includes("synthetic-2")) ?? files[1] ?? files[0] ?? "";
  if (sourceA === "" || sourceB === "") throw new Error("Нет тестовых фото для identity.");

  // A: тот же товар — полный прогон до whitebg, затем identity.
  let jobA = await createJob("wb", sourceA);
  for (const step of ["inspect", "segment", "compose", "whitebg"] as const) {
    jobA = await runStep(jobA, step);
  }
  const segA = segmentResultSchema.parse(await readStepResult(jobA.id, "segment"));
  const composeA = composeResultSchema.parse(await readStepResult(jobA.id, "compose"));
  const whiteA = whitebgResultSchema.parse(await readStepResult(jobA.id, "whitebg"));
  const same = await computeIdentity(sourceA, whiteA.outPath, {
    sourceMaskPath: segA.maskPath,
    mainMaskPath: composeA.maskPath,
  });
  console.log(
    `same product: identity=${same.identity.toFixed(4)} ${same.passed ? "PASS" : "FAIL"} ` +
      `| phash=${same.breakdown.phashSimilarity.toFixed(3)} (bits ${same.breakdown.phashBits}) ` +
      `| hsv=${same.breakdown.hsvScore.toFixed(3)} (corr ${same.breakdown.hsvCorrelation.toFixed(3)}) ` +
      `| ssim=${same.breakdown.ssim.toFixed(3)} ` +
      `| glimmer=${same.breakdown.glimmerSame ? "same" : "different"} ${same.breakdown.glimmerVotes}/3 ` +
      `| contrib ph=${same.contributions.phash.toFixed(3)} hsv=${same.contributions.hsv.toFixed(3)} ` +
      `ssim=${same.contributions.ssim.toFixed(3)} gl=${same.contributions.glimmer.toFixed(3)}`,
  );

  // B: подмена похожим — sourceA против финала sourceB.
  let jobB = await createJob("wb", sourceB);
  for (const step of ["inspect", "segment", "compose", "whitebg"] as const) {
    jobB = await runStep(jobB, step);
  }
  const composeB = composeResultSchema.parse(await readStepResult(jobB.id, "compose"));
  const whiteB = whitebgResultSchema.parse(await readStepResult(jobB.id, "whitebg"));
  const substituted = await computeIdentity(sourceA, whiteB.outPath, {
    sourceMaskPath: segA.maskPath,
    mainMaskPath: composeB.maskPath,
  });
  console.log(
    `substituted: identity=${substituted.identity.toFixed(4)} ${substituted.passed ? "PASS(unexpected)" : "FAIL(expected)"} ` +
      `| phash=${substituted.breakdown.phashSimilarity.toFixed(3)} (bits ${substituted.breakdown.phashBits}) ` +
      `| hsv=${substituted.breakdown.hsvScore.toFixed(3)} (corr ${substituted.breakdown.hsvCorrelation.toFixed(3)}) ` +
      `| ssim=${substituted.breakdown.ssim.toFixed(3)} ` +
      `| glimmer=${substituted.breakdown.glimmerSame ? "same" : "different"} ${substituted.breakdown.glimmerVotes}/3`,
  );

  // Петля: persistent-провал через IDENTITY_FORCE_FAIL (симуляция подмены,
  // которую детерминированный compose не самозалечивает; mock-glimmer иначе
  // всегда same=true). Ожидаем ровно 2 ретрая.
  process.env.IDENTITY_FORCE_FAIL = "1";
  let jobC = await createJob("wb", sourceA);
  for (const step of ["inspect", "segment", "compose", "whitebg"] as const) {
    jobC = await runStep(jobC, step);
  }
  jobC = await runStep(jobC, "identity");
  const stored = identityResultSchema.parse(await readStepResult(jobC.id, "identity"));
  delete process.env.IDENTITY_FORCE_FAIL;
  console.log(
    `retry-loop: identity=${stored.identity.toFixed(4)} passed=${stored.passed} ` +
      `retries=${stored.retries} attempts(identity)=${jobC.attempts.identity} attempts(compose)=${jobC.attempts.compose} ` +
      `checklist=${JSON.stringify(jobC.checklist.find((c) => c.id === "identity"))}`,
  );

  let failed = 0;
  if (!(same.identity >= 0.9)) {
    console.log(`FAIL: same product identity ${same.identity.toFixed(4)} < 0.90`);
    failed += 1;
  }
  if (!(substituted.identity < 0.9)) {
    console.log(`FAIL: substituted identity ${substituted.identity.toFixed(4)} >= 0.90`);
    failed += 1;
  }
  if (!(stored.retries === 2 && jobC.attempts.identity >= 3 && stored.passed === false)) {
    console.log(
      `FAIL: петля не отработала 2 ретрая (retries=${stored.retries}, attempts.identity=${jobC.attempts.identity}, passed=${stored.passed})`,
    );
    failed += 1;
  }
  console.log(`files=${files.length} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
