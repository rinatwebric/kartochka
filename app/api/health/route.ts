import { NextResponse } from "next/server";
import { isMock } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELS = [
  "sam-3.1",
  "muse-image-1.0",
  "muse-spark-1.3",
  "muse-spark-1.3-contributor",
  "muse-glimmer",
];

// Флаг mock — через lib/env: без MODEL_API_KEY живой режим невозможен
// и включается MOCK принудительно. Читать process.env напрямую здесь
// нельзя — будет врать «mock: false» на машине без ключа.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, mock: isMock(), models: MODELS });
}
