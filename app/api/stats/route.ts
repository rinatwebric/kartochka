import { readdir, readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { JOBS_DIR, jobFilePath } from "@/lib/pipeline/state";
import { jobStateSchema } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Счётчики по джобам на диске (JOBS_DIR/<id>/job.json): сколько джоб,
// сколько доведено до done, суммарные кредиты и средний score.
// Память процесса не переживает рестарт — честно считаем то, что лежит
// на диске; если диска нет (чистый старт), отдаём нули.
export async function GET(): Promise<NextResponse> {
  let entries: string[];
  try {
    entries = await readdir(JOBS_DIR);
  } catch {
    return NextResponse.json({ jobs: 0, cards: 0, credits: 0, avgScore: 0 });
  }
  let jobs = 0;
  let cards = 0;
  let credits = 0;
  let scoreSum = 0;
  for (const entry of entries) {
    let text: string;
    try {
      text = await readFile(jobFilePath(entry), "utf-8");
    } catch {
      continue;
    }
    const parsed = jobStateSchema.safeParse(JSON.parse(text) as unknown);
    if (!parsed.success) continue;
    jobs += 1;
    if (parsed.data.status === "done") cards += 1;
    credits += parsed.data.metrics.credits;
    scoreSum += parsed.data.metrics.score;
  }
  return NextResponse.json({
    jobs,
    cards,
    credits: Math.round(credits * 100) / 100,
    avgScore: jobs > 0 ? Math.round((scoreSum / jobs) * 10) / 10 : 0,
  });
}
