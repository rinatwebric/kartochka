import { NextResponse } from "next/server";
import { loadJob, StepError } from "@/lib/pipeline/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Состояние одной джобы для батч-таблицы и опроса прогресса.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const job = await loadJob(id);
    return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StepError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Не прочитал джобу. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
