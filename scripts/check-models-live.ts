// Live-проба Meta Model API: что реально отдаёт ключ.
// Читает .env вручную (без dotenv — стек запрещает новые зависимости).
// Запуск: pnpm tsx scripts/check-models-live.ts
// Тратит живые кредиты: по одному вызову на модель. Не гонять в цикле.
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv(): void {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    console.log("no .env, using process env only");
  }
}

loadDotEnv();
// Живой режим: MOCK из .env (ожидается 0), ключ из .env.
delete process.env.MOCK_SAFETY;

async function main(): Promise<void> {
  const { getCreditsTotal } = await import("../lib/models/meta");
  const { segmentWithSam } = await import("../lib/models/sam");
  const { generateImage } = await import("../lib/models/image");
  const { askSpark } = await import("../lib/models/spark");
  const { judgeIdentity } = await import("../lib/models/glimmer");

  const demoImage =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const results: Array<{ model: string; ok: boolean; info: string }> = [];

  async function probe(model: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      const out = await fn();
      const text = typeof out === "string" ? out : JSON.stringify(out);
      results.push({ model, ok: true, info: text.slice(0, 200) });
    } catch (err) {
      results.push({
        model,
        ok: false,
        info: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err).slice(0, 300),
      });
    }
  }

  await probe("spark", () => askSpark("Ответь одним словом: тест."));
  await probe("sam", () => segmentWithSam(demoImage, "white mug"));
  await probe("glimmer", () => judgeIdentity("Тот же ли товар на фото?"));
  await probe("image", () => generateImage({ prompt: "white background product shot", image: demoImage }));

  for (const r of results) {
    console.log(`${r.ok ? "LIVE-OK  " : "LIVE-FAIL"} ${r.model}: ${r.info}`);
  }
  console.log(`credits total=${getCreditsTotal()}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
