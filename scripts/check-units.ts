// Юнит-проверки чистых функций пайплайна: парсер боксов SAM и перенормировка
// identity при glimmer-abstain. Без моделей и кредитов — только математика.
// Запуск: pnpm check:units (или pnpm tsx scripts/check-units.ts).
import { parseSamBoxes } from "../lib/models/sam";
import { applyIdentityContributions, IDENTITY_WEIGHTS } from "../lib/pipeline/identity";

let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail === undefined ? "" : ` | ${detail}`}`);
  }
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

async function main(): Promise<void> {
  // parseSamBoxes: примеры из https://dev.meta.ai/docs/sam/reading-segmentation
  check("sam-boxes empty", parseSamBoxes("").length === 0);
  check("sam-boxes garbage", parseSamBoxes("no boxes here <|mask;...|>").length === 0);
  const single = parseSamBoxes(
    "text<0f>0<|box;x1=181;y1=365;x2=556;y2=486;w=1516;h=1600|><|mask;x=0;y=0;data=122,376,~...|>",
  );
  check("sam-boxes single count", single.length === 1, `got=${single.length}`);
  const first = single[0];
  check(
    "sam-boxes single norm",
    first !== undefined &&
      approx(first.x, 181 / 1516) &&
      approx(first.width, (556 - 181 + 1) / 1516),
    `got=${JSON.stringify(first)}`,
  );
  const three = parseSamBoxes(
    "text<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,101,~...|>" +
      ",1<|box;x1=260;y1=382;x2=340;y2=427;w=537;h=561|><|mask;x=0;y=0;data=46,81,~...|>" +
      ",2<|box;x1=516;y1=117;x2=536;y2=150;w=537;h=561|><|mask;x=0;y=0;data=34,21,~...|>",
  );
  check("sam-boxes three count", three.length === 3, `got=${three.length}`);
  const conf = parseSamBoxes(
    "text<0f>1<|box;x1=444;y1=625;x2=679;y2=850;w=1800;h=1200;c=0.9609375|><|mask;x=0;y=0;c=0.9609375;data=226,236,!...|>",
  );
  check("sam-boxes confidence token", conf.length === 1, `got=${conf.length}`);

  // applyIdentityContributions: обычный режим — веса как в MASTER.md §8
  const normal = applyIdentityContributions(1, 1, 1, true);
  check(
    "identity full weights",
    approx(normal.phash, 0.35) && approx(normal.hsv, 0.25) &&
      approx(normal.ssim, 0.25) && approx(normal.glimmer, 0.15),
    `got=${JSON.stringify(normal)}`,
  );
  const normalFail = applyIdentityContributions(0.6, 0.8, 0.9, false);
  check(
    "identity glimmer-different zeroes glimmer",
    approx(normalFail.glimmer, 0) &&
      approx(normalFail.phash, IDENTITY_WEIGHTS.phash * 0.6),
    `got=${JSON.stringify(normalFail)}`,
  );

  // abstain (glimmerSame=null): три сигнала делятся на 0.85, glimmer=0
  const abstained = applyIdentityContributions(0.6, 0.8, 0.9, null);
  const scale = 1 / (1 - IDENTITY_WEIGHTS.glimmer);
  check(
    "identity abstain renormalized",
    approx(abstained.glimmer, 0) &&
      approx(abstained.phash, 0.35 * 0.6 * scale) &&
      approx(abstained.hsv, 0.25 * 0.8 * scale) &&
      approx(abstained.ssim, 0.25 * 0.9 * scale),
    `got=${JSON.stringify(abstained)}`,
  );
  check(
    "identity abstain-preserving-relative-weights",
    approx(abstained.phash / abstained.hsv, (0.35 * 0.6) / (0.25 * 0.8)),
    `got=${JSON.stringify(abstained)}`,
  );

  console.log(failed === 0 ? "units: all green" : `units: ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
