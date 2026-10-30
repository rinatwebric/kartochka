import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NextResponse } from "next/server";
import { loadJob, readStepResult, StepError } from "@/lib/pipeline/state";
import { composeResultSchema } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Бинарь одного файла джобы для клиентской сборки ZIP:
//   GET /api/jobs/{id}/asset/main.jpg  финальный кадр (whitebg)
//   GET /api/jobs/{id}/asset/mask.png   маска товара из compose
//   GET /api/jobs/{id}/asset/source     исходное фото
const ASSET_NAMES = ["main.jpg", "main", "mask.png", "mask", "source"] as const;
type AssetName = (typeof ASSET_NAMES)[number];

function isAssetName(value: string): value is AssetName {
  return (ASSET_NAMES as readonly string[]).includes(value);
}

function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
): Promise<Response> {
  const { id, name } = await params;
  try {
    if (!isAssetName(name)) {
      return NextResponse.json(
        { error: `Файл «${name}» не отдаём: доступны main.jpg, mask.png, source.` },
        { status: 404 },
      );
    }
    const job = await loadJob(id);
    let filePath: string | undefined;
    if (name === "main.jpg" || name === "main") {
      filePath = job.assets.main;
    } else if (name === "mask.png" || name === "mask") {
      const compose = await readStepResult<unknown>(id, "compose");
      const parsed = compose === null ? null : composeResultSchema.safeParse(compose);
      filePath = parsed !== null && parsed.success ? parsed.data.maskPath : undefined;
    } else {
      filePath = job.assets.source;
    }
    if (filePath === undefined) {
      return NextResponse.json(
        { error: "Файл ещё не готов: дождитесь конца прогона и попробуйте снова." },
        { status: 409 },
      );
    }
    let data: Buffer;
    try {
      data = await readFile(filePath);
    } catch {
      return NextResponse.json(
        { error: "Файл не найден на диске: перезапустите шаг пайплайна." },
        { status: 404 },
      );
    }
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(filePath),
        "Content-Length": String(data.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof StepError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Не удалось отдать файл. Попробуйте ещё раз." }, { status: 500 });
  }
}
