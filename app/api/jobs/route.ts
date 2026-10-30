import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { createJob, jobDir } from "@/lib/pipeline/state";
import { marketplaceSchema } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Создание джоб для батча T7: FormData { file|files, marketplace }.
// Один файл = одна джоба, ответ { jobs: [{ id, fileName }] }.
// Лимиты здесь только технические (число и размер файлов), пороги
// регламента по-прежнему только в rules/*.json.
const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function extFor(file: File): string {
  const fromName = extname(file.name).toLowerCase();
  if (ALLOWED_EXTS.has(fromName)) return fromName === ".jpeg" ? ".jpg" : fromName;
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Не прочитал форму загрузки: прикрепите фото и выберите площадку." },
      { status: 400 },
    );
  }
  const marketplaceRaw = form.get("marketplace");
  const parsedMp = marketplaceSchema.safeParse(marketplaceRaw);
  if (!parsedMp.success) {
    return NextResponse.json(
      { error: "Выберите площадку: wb, ozon или amazon." },
      { status: 400 },
    );
  }
  const incoming: File[] = [];
  for (const key of ["files", "file"] as const) {
    for (const value of form.getAll(key)) {
      if (typeof value === "object" && value !== null && "arrayBuffer" in value) {
        incoming.push(value as File);
      }
    }
  }
  if (incoming.length === 0) {
    return NextResponse.json(
      { error: "Нет фото: прикрепите от 1 до 20 файлов jpg, png или webp." },
      { status: 400 },
    );
  }
  if (incoming.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Слишком много фото: максимум ${MAX_FILES} за один батч, а пришло ${incoming.length}.` },
      { status: 400 },
    );
  }
  const jobs: Array<{ id: string; fileName: string }> = [];
  for (const file of incoming) {
    const looksImage =
      ALLOWED_TYPES.has(file.type) || ALLOWED_EXTS.has(extname(file.name).toLowerCase());
    if (!looksImage) {
      return NextResponse.json(
        { error: `Файл «${file.name}» не похож на фото: нужны jpg, png или webp.` },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Файл «${file.name}» вне лимита 1 Б – 15 МБ.` },
        { status: 400 },
      );
    }
  }
  try {
    for (const file of incoming) {
      // Сначала резервируем джобу (даёт id и папку), затем кладём исходник рядом.
      const placeholder = await createJob(parsedMp.data, "pending");
      const dir = jobDir(placeholder.id);
      await mkdir(dir, { recursive: true });
      const sourcePath = join(dir, `source${extFor(file)}`);
      await writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));
      // createJob уже сохранил джобу с source="pending" — чинить нечем без
      // перезаписи, поэтому сохраняем исправленный путь тем же saveJob.
      const { saveJob } = await import("@/lib/pipeline/state");
      await saveJob({ ...placeholder, assets: { ...placeholder.assets, source: sourcePath } });
      jobs.push({ id: placeholder.id, fileName: file.name });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Не создал джобы. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
  return NextResponse.json({ jobs, marketplace: parsedMp.data });
}
