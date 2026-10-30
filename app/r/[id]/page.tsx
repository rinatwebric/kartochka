import { CheckCircle2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { loadJob, StepError } from "@/lib/pipeline/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKETPLACE_NAME: Record<string, string> = {
  wb: "Wildberries",
  ozon: "Ozon",
  amazon: "Amazon",
};

// Публичная read-only страница результата: крупный кадр, чек-лист, текст,
// подпись «сделано в КАРТОЧКА за N секунд и M кредитов». Кнопок редактирования
// нет — только просмотр и одна ссылка «собрать свою».
export default async function PublicResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  let job;
  try {
    job = await loadJob(id);
  } catch (err) {
    if (err instanceof StepError) notFound();
    throw err;
  }
  const marketplace = MARKETPLACE_NAME[job.marketplace] ?? job.marketplace;
  const seconds = (job.metrics.ms / 1000).toFixed(1);
  const credits = job.metrics.credits.toFixed(2);
  const mainSrc = `/api/jobs/${job.id}/asset/main.jpg`;
  const hasCopy = job.copy.title.length > 0;
  const passedCount = job.checklist.filter((item) => item.ok).length;

  return (
    <main className="min-h-screen bg-ink-950 text-paper">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-semibold text-faint">
          {marketplace} · публичный результат
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-2xl font-bold tracking-tight md:text-3xl">
          {hasCopy ? job.copy.title : "Карточка ещё собирается"}
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Read-only копия из КАРТОЧКИ: что приняла бы площадка, что нет и почему —
          с замерами, а не ощущениями.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section aria-label="Главный кадр" className="rounded-card border border-white/10 bg-ink-900 p-4 shadow-lift">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mainSrc}
              alt={hasCopy ? `Главный кадр: ${job.copy.title}` : "Главный кадр карточки"}
              className="aspect-[3/4] w-full rounded-chip bg-white object-contain"
            />
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm tabular-nums text-muted">
              <span className="rounded-chip bg-accent px-2.5 py-1 text-xs font-bold text-accent-ink">
                {job.metrics.score} / 100
              </span>
              {passedCount} из {job.checklist.length} пунктов
            </p>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-label="Чек-лист регламента" className="rounded-card border border-white/10 bg-ink-900 p-5">
              <h2 className="text-lg font-bold">Чек-лист регламента</h2>
              {job.checklist.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Проверка ещё не запускалась — попросите автора карточки завершить прогон.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {job.checklist.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      {item.ok ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                      ) : (
                        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                      )}
                      <span>
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 block text-sm tabular-nums text-muted">{item.measured}</span>
                        {!item.ok && item.fix !== undefined && (
                          <span className="mt-1 block text-sm leading-relaxed text-paper/90">{item.fix}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Текст карточки" className="rounded-card border border-white/10 bg-ink-900 p-5">
              <h2 className="text-lg font-bold">Текст карточки</h2>
              {hasCopy ? (
                <div className="mt-3">
                  <p className="text-sm leading-relaxed text-paper/90">{job.copy.description}</p>
                  {Object.keys(job.copy.specs).length > 0 && (
                    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      {Object.entries(job.copy.specs).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="text-faint">{key}</dt>
                          <dd className="text-paper/90">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Текст ещё не написан — попросите автора карточки завершить прогон.
                </p>
              )}
            </section>
          </div>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="text-sm text-muted">
            Сделано в КАРТОЧКА за {seconds} с и {credits} кредитов · {marketplace}
          </p>
          <a
            href="/"
            className="inline-flex items-center rounded-control border border-white/15 px-4 py-2 text-sm font-semibold text-paper transition-colors duration-200 hover:border-white/30"
          >
            Собрать свою карточку
          </a>
        </footer>
      </div>
    </main>
  );
}
