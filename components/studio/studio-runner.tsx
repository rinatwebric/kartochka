"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Play, XCircle } from "lucide-react";
import { ResultActions } from "@/components/studio/result-actions";
import type { JobState } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  "inspect",
  "segment",
  "compose",
  "whitebg",
  "identity",
  "rules",
  "copy",
] as const;

const STEP_LABEL: Record<string, string> = {
  inspect: "замер",
  segment: "маска",
  compose: "фон",
  whitebg: "белый",
  identity: "identity",
  rules: "регламент",
  copy: "текст",
};

type StudioRunnerProps = {
  id: string;
};

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

export function StudioRunner({ id }: StudioRunnerProps): React.ReactElement {
  const [job, setJob] = useState<JobState | null>(null);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as JobState | { error?: string } | null;
    if (!res.ok || body === null || !("metrics" in body)) {
      const message =
        body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `Джоба не открылась (${res.status}). Создайте новую на главной.`;
      setLoadError(message);
      return;
    }
    setJob(body);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun(): Promise<void> {
    if (running) return;
    setRunning(true);
    setRunError(null);
    try {
      let state: JobState | null = job;
      for (const step of STEPS) {
        setCurrentStep(step);
        const res = await fetch(`/api/jobs/${id}/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step }),
        });
        const body = (await res.json().catch(() => null)) as
          | (JobState & { error?: string })
          | { error?: string }
          | null;
        if (!res.ok || body === null || !("metrics" in body)) {
          const message =
            body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : `шаг «${step}» не прошёл (${res.status})`;
          throw new Error(message);
        }
        state = body;
        setJob(state);
      }
      if (state === null) throw new Error("Пустой ответ пайплайна. Попробуйте ещё раз.");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Прогон упал. Фото цело — попробуйте ещё раз.");
    } finally {
      setCurrentStep(null);
      setRunning(false);
    }
  }

  if (loadError !== null) {
    return (
      <main className="min-h-screen bg-ink-950 text-paper">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <p role="alert" className="rounded-card border border-white/10 bg-ink-900 p-6 text-sm leading-relaxed text-red-300">
            {loadError}
          </p>
          <a
            href="/"
            className="mt-4 inline-flex items-center rounded-control border border-white/15 px-5 py-3 text-sm font-semibold text-paper transition-colors duration-200 hover:border-white/30"
          >
            На главную
          </a>
        </div>
      </main>
    );
  }

  if (job === null) {
    return (
      <main className="min-h-screen bg-ink-950 text-paper">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-16 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <p>Открываю джобу…</p>
        </div>
      </main>
    );
  }

  const failed = job.checklist.filter((item) => !item.ok);
  const passedCount = job.checklist.length - failed.length;
  const hasCopy = job.copy.title.length > 0;
  const cacheBuster = job.step;

  return (
    <main className="min-h-screen bg-ink-950 text-paper">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-semibold text-faint">
          Студия · {job.marketplace} · {job.id.slice(0, 8)}
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-2xl font-bold tracking-tight md:text-3xl">
          {hasCopy ? job.copy.title : "Собираю карточку"}
        </h1>

        <ol aria-label="Шаги сборки" className="mt-6 flex flex-wrap gap-2">
          {STEPS.map((step) => {
            const active = currentStep === step;
            const reached = STEPS.indexOf(step) <= STEPS.indexOf(job.step as (typeof STEPS)[number]);
            return (
              <li
                key={step}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-xs font-semibold",
                  active
                    ? "bg-accent text-accent-ink"
                    : reached
                      ? "border border-accent/40 bg-ink-800 text-paper"
                      : "border border-white/10 bg-ink-900 text-faint",
                )}
              >
                {active && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                {STEP_LABEL[step] ?? step}
              </li>
            );
          })}
        </ol>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={running}
            className={cn(
              "inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3",
              "text-sm font-bold text-accent-ink shadow-flat",
              "transition-colors duration-200 hover:bg-accent-soft",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {running
              ? `Шаг «${STEP_LABEL[currentStep ?? ""] ?? "…"}»…`
              : job.metrics.score > 0
                ? "Прогнать заново"
                : "Собрать карточку"}
          </button>
          {runError !== null && (
            <p role="alert" className="mt-3 text-sm leading-relaxed text-red-300">
              {runError}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section aria-label="До и после" className="rounded-card border border-white/10 bg-ink-900 p-4 shadow-lift">
            <div className="grid grid-cols-2 gap-4">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/jobs/${job.id}/asset/source`}
                  alt="Исходное фото товара"
                  className="aspect-[3/4] w-full rounded-chip bg-white object-cover"
                />
                <figcaption className="mt-2 text-xs font-semibold text-faint">До — ваше фото</figcaption>
              </figure>
              <figure>
                {job.assets.main !== undefined ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={cacheBuster}
                    src={`/api/jobs/${job.id}/asset/main.jpg`}
                    alt={hasCopy ? `Главный кадр: ${job.copy.title}` : "Главный кадр карточки"}
                    className="aspect-[3/4] w-full rounded-chip bg-white object-contain"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-chip bg-white/5 text-xs leading-relaxed text-faint">
                    Кадр появится
                    <br />
                    после шага «белый»
                  </div>
                )}
                <figcaption className="mt-2 text-xs font-semibold text-faint">После — белый фон 255</figcaption>
              </figure>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-label="Метрики" className="rounded-card border border-white/10 bg-ink-900 p-5">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-display text-3xl font-bold tabular-nums">
                    {job.metrics.score}
                    <span className="font-sans text-base font-semibold text-faint">/100</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">соответствие</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{job.metrics.identity.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted">identity</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold tabular-nums">{job.metrics.credits.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted">кредиты · {formatSeconds(job.metrics.ms)}</p>
                </div>
              </div>
              {job.checklist.length > 0 && (
                <p className="mt-3 text-center text-sm text-muted tabular-nums">
                  Пройдено {passedCount} из {job.checklist.length} пунктов
                  {job.metrics.retries > 0 ? ` · ретраев: ${job.metrics.retries}` : ""}
                </p>
              )}
            </section>

            <section aria-label="Чек-лист регламента" className="rounded-card border border-white/10 bg-ink-900 p-5">
              <h2 className="text-lg font-bold">Чек-лист регламента</h2>
              {job.checklist.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Нажмите «Собрать карточку»: каждый пункт будет с замером и советом, что поправить.
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
                        <span
                          aria-hidden="true"
                          title={`Вес пункта: ${item.weight}`}
                          className="mt-2 block h-1 w-32 overflow-hidden rounded-full bg-white/10"
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              item.ok ? "bg-emerald-400/70" : "bg-accent/80",
                            )}
                            style={{ width: `${Math.min(100, Math.max(6, (item.weight / 25) * 100))}%` }}
                          />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {hasCopy && (
              <section aria-label="Текст карточки" className="rounded-card border border-white/10 bg-ink-900 p-5">
                <h2 className="text-lg font-bold">Текст карточки</h2>
                <p className="mt-3 text-sm leading-relaxed text-paper/90">{job.copy.description}</p>
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
              </section>
            )}

            {hasCopy && (
              <ResultActions
                jobId={job.id}
                marketplace={job.marketplace}
                title={job.copy.title}
                description={job.copy.description}
                specs={job.copy.specs}
              />
            )}

            <a
              href={`/r/${job.id}`}
              className="inline-flex items-center gap-2 self-start rounded-control border border-white/15 px-4 py-2 text-sm font-semibold text-paper transition-colors duration-200 hover:border-white/30"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Открыть публичную ссылку
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
