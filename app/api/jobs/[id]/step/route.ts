import { NextResponse } from "next/server";
import { loadJob, StepError } from "@/lib/pipeline/state";
import { runStep } from "@/lib/pipeline/runner";
import { jobStepSchema } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Один шаг пайплайна: POST /api/jobs/{id}/step { step }.
// Клиент (батч) дёргает шаги по очереди и рисует прогресс —
// долгих Vercel-запросов нет, каждый шаг короткий (см. MASTER.md 5).
const STEP_ORDER = [
  "inspect",
  "segment",
  "compose",
  "whitebg",
  "identity",
  "rules",
  "copy",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Не понял шаг: пришлите JSON { step }." },
      { status: 400 },
    );
  }
  const parsed = jobStepSchema.safeParse(
    typeof body === "object" && body !== null && "step" in body
      ? (body as { step: unknown }).step
      : body,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Шаг не распознан: доступны ${STEP_ORDER.join(", ")}.` },
      { status: 400 },
    );
  }
  try {
    const job = await loadJob(id);
    const next = await runStep(job, parsed.data);
    return NextResponse.json(next, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StepError) {
      return NextResponse.json(
        { error: err.message, missing: err.missing },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: "Шаг упал с неизвестной ошибкой. Фото цело — попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
