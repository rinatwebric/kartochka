import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { createJob, jobDir, saveJob } from "@/lib/pipeline/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Демо в один клик: создаёт джобу из synthetic-1.jpg и уводит в студию,
// где судья сам нажимает «Собрать карточку». Работает без ключа —
// пайплайн в MOCK-режиме детерминированный (см. lib/mock/provider.ts).
// Каждый визит создаёт новую джобу: идемпотентность шагов это переживает.
export default async function DemoPage(): Promise<React.ReactElement> {
  const fixture = join(process.cwd(), "fixtures", "photos", "synthetic-1.jpg");
  let source: Buffer;
  try {
    source = await readFile(fixture);
  } catch {
    redirect("/");
  }
  const job = await createJob("wb", "pending");
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });
  const sourcePath = join(dir, "source.jpg");
  await writeFile(sourcePath, new Uint8Array(source));
  await saveJob({ ...job, assets: { ...job.assets, source: sourcePath } });
  redirect(`/studio/${job.id}`);
}
