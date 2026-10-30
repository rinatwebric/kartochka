// Проверка T2: в mock-режиме прогоняет все четыре обёртки и печатает результат.
// Запуск: pnpm tsx scripts/check-models.ts
// MOCK выставляется до импорта lib/env (env читается один раз при импорте),
// поэтому обёртки подтягиваем динамически после установки переменных.
process.env.MOCK = "1";
delete process.env.MODEL_API_KEY;

async function main(): Promise<void> {
  const { getCreditsTotal } = await import("../lib/models/meta");
  const { segmentWithSam } = await import("../lib/models/sam");
  const { generateImage } = await import("../lib/models/image");
  const { askSpark } = await import("../lib/models/spark");
  const { judgeIdentity } = await import("../lib/models/glimmer");

  const demoImage =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const sam = await segmentWithSam(demoImage, "white mug");
  console.log("sam:", JSON.stringify(sam).slice(0, 200));

  const image = await generateImage({ prompt: "white background product shot", image: demoImage });
  console.log("image:", image.b64 !== undefined ? `b64 len=${image.b64.length}` : image.url);

  const text = await askSpark("Опиши товар одним предложением.");
  console.log("spark:", text);

  const verdict = await judgeIdentity("Тот же ли товар на фото?");
  console.log("glimmer:", JSON.stringify(verdict));

  console.log(`credits total=${getCreditsTotal()}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
