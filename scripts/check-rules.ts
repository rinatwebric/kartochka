// Проверка T5: движок регламента на подставных метриках по трём площадкам,
// включая кейс «валидно для Ozon, но не для Amazon». Плюс расширяемость:
// временный rules/test.json прогоняется без изменения кода.
// Запуск: pnpm check:rules (или pnpm tsx scripts/check-rules.ts). Работает без ключа.
process.env.MOCK = "1";
delete process.env.MODEL_API_KEY;

import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface FixtureMetrics {
  width: number;
  height: number;
  aspect: number;
  fill: number;
  bgWhite: number;
  borders: { left: boolean; right: boolean; top: boolean; bottom: boolean };
}

interface FixtureVision {
  ok: boolean;
  bbox: { x: number; y: number; width: number; height: number } | null;
  reason: string;
}

type VisionMap = Record<"no_text_on_main" | "no_watermark" | "single_object", FixtureVision>;

const PASS_VISION: VisionMap = {
  no_text_on_main: { ok: true, bbox: null, reason: "mock: текста, рамок и инфографики нет" },
  no_watermark: { ok: true, bbox: null, reason: "mock: водяных знаков нет" },
  single_object: {
    ok: true,
    bbox: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    reason: "mock: один товар в кадре",
  },
};

// Хороший кадр 3:4 после whitebg: проходит WB и Ozon, но не Amazon
// (у Amazon квадрат 1:1, минимум 1000 px и fill от 85%).
const GOOD_MAIN: FixtureMetrics = {
  width: 900,
  height: 1200,
  aspect: 900 / 1200,
  fill: 0.71,
  bgWhite: 0.996,
  borders: { left: false, right: false, top: false, bottom: false },
};

// Плохой кадр: обрезан снизу, фон серый, товара мало в кадре.
const BAD_MAIN: FixtureMetrics = {
  width: 800,
  height: 1200,
  aspect: 800 / 1200,
  fill: 0.45,
  bgWhite: 0.93,
  borders: { left: false, right: false, top: false, bottom: true },
};

const TEXT_FOUND_VISION: VisionMap = {
  ...PASS_VISION,
  no_text_on_main: {
    ok: false,
    bbox: { x: 0.05, y: 0.02, width: 0.9, height: 0.12 },
    reason: "mock: плашка с текстом сверху кадра",
  },
};

function line(checkId: string, measured: string, ok: boolean): string {
  return `  ${ok ? "ok  " : "FAIL"} ${checkId} | ${measured}`;
}

async function main(): Promise<void> {
  const { checkMarketplace } = await import("../lib/pipeline/rules");
  let failed = 0;
  const note = (cond: boolean, msg: string): void => {
    console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
    if (!cond) failed += 1;
  };

  for (const mp of ["wb", "ozon", "amazon"] as const) {
    const res = await checkMarketplace(mp, GOOD_MAIN, PASS_VISION);
    console.log(`--- ${mp} / хороший кадр ---`);
    for (const item of res.checklist) console.log(line(item.id, item.measured, item.ok));
    console.log(
      `итог ${mp}: compliance=${res.compliance.toFixed(3)} score=${res.score} ` +
        `пройдено=${res.checklist.filter((c) => c.ok).length}/${res.checklist.length}`,
    );
    if (mp === "wb" || mp === "ozon") {
      note(res.compliance === 1 && res.score === 100, `${mp}: хороший кадр проходит целиком`);
    }
    if (mp === "amazon") {
      const failedIds = res.checklist.filter((c) => !c.ok).map((c) => c.id);
      note(res.compliance < 1, "amazon: хороший 3:4 кадр НЕ проходит целиком");
      for (const id of ["aspect", "min_size", "fill"]) {
        note(failedIds.includes(id), `amazon: пункт «${id}» провален (ожидаемо)`);
      }
    }
  }

  const bad = await checkMarketplace("wb", BAD_MAIN, TEXT_FOUND_VISION);
  console.log("--- wb / плохой кадр ---");
  for (const item of bad.checklist) {
    const extra = item.ok ? "" : ` | fix: ${item.fix ?? ""} | why: ${item.reason ?? ""}`;
    console.log(`${line(item.id, item.measured, item.ok)}${extra}`);
  }
  console.log(`итог wb/bad: compliance=${bad.compliance.toFixed(3)} score=${bad.score}`);
  note(bad.compliance < 1, "wb: плохой кадр не проходит");
  note(
    (bad.checklist.find((c) => c.id === "not_cropped")?.ok ?? true) === false,
    "wb: обрезка снизу поймана пунктом not_cropped",
  );
  note(
    (bad.checklist.find((c) => c.id === "no_text_on_main")?.ok ?? true) === false,
    "wb: текст пойман пунктом no_text_on_main",
  );

  // Расширяемость: новая площадка = новый JSON, код не трогаем.
  const rulesDir = join(process.cwd(), "rules");
  const ozonRaw = await readFile(join(rulesDir, "ozon.json"), "utf-8");
  const testRaw = (JSON.parse(ozonRaw) as Record<string, unknown> & { name?: unknown }) as Record<
    string,
    unknown
  >;
  testRaw["name"] = "Test";
  const testPath = join(rulesDir, "test.json");
  await writeFile(testPath, JSON.stringify(testRaw, null, 2), "utf-8");
  try {
    const testRes = await checkMarketplace("test", GOOD_MAIN, PASS_VISION);
    console.log(
      `--- test (временный rules/test.json) ---\nитог test: compliance=${testRes.compliance.toFixed(3)} score=${testRes.score}`,
    );
    note(testRes.compliance === 1, "test.json: новая площадка работает без правки кода");
  } finally {
    await unlink(testPath);
  }

  console.log(`failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
