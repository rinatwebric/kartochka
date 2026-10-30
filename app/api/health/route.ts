import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELS = [
  "sam-3.1",
  "muse-image-1.0",
  "muse-spark-1.3",
  "muse-spark-1.3-contributor",
  "muse-glimmer",
];

export async function GET(): Promise<NextResponse> {
  const mock = process.env.MOCK === "1";
  return NextResponse.json({ ok: true, mock, models: MODELS });
}
