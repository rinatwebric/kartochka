import { NextResponse } from "next/server";
import { buildExportPayload } from "@/lib/pipeline/export";
import { StepError } from "@/lib/pipeline/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Данные для клиентской сборки ZIP: текст, чек-лист и ссылки на бинари.
// Бинари клиент дотягивает из /api/jobs/{id}/asset/{name} и кладёт в архив
// вместе с card.json, card.txt и checklist.json.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const payload = await buildExportPayload(id);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof StepError) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Не удалось собрать экспорт. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
