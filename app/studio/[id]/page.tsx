import { StudioRunner } from "@/components/studio/studio-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Экран прогона одной карточки: лента шагов, до/после, чек-лист с замерами,
// метрики, экспорт и ссылка на публичную страницу.
export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <StudioRunner id={id} />;
}
