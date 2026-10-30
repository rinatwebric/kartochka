"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { BatchSummary } from "@/components/batch/batch-summary";
import { BatchTable, type BatchRow } from "@/components/batch/batch-table";
import { MarketplacePicker, type Marketplace } from "@/components/upload/marketplace-picker";
import type { JobState } from "@/lib/pipeline/types";
import { buildZip } from "@/lib/utils/zip";
import { slugifyFileName } from "@/lib/utils/slug";
import { cn } from "@/lib/utils/cn";
import { z } from "zod";

// Лёгкая клиентская схема ответа /api/jobs/{id}/export: полный
// exportPayloadSchema из lib/pipeline/export.ts импортировать нельзя —
// тот модуль тянет node:fs через copy/state и роняет клиентский бандл.
const batchExportSchema = z.object({
  id: z.string().min(1),
  marketplace: z.string().min(1),
  copy: z.object({
    title: z.string(),
    description: z.string(),
    specs: z.record(z.string(), z.string()),
  }),
  checklist: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      ok: z.boolean(),
      measured: z.string(),
    }),
  ),
  compliance: z.number(),
  score: z.number(),
  cardTxt: z.string().min(1),
});

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

function failsOf(job: JobState): string[] {
  return job.checklist.filter((item) => !item.ok).map((item) => item.measured || item.label);
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`файл ${url} не загрузился (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export default function BatchPage(): React.ReactElement {
  const [files, setFiles] = useState<File[]>([]);
  const [marketplace, setMarketplace] = useState<Marketplace>("wb");
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const finished = rows.filter((r) => r.status === "done" || r.status === "failed").length;
  const passed = rows.filter((r) => r.status === "done" && r.fails.length === 0).length;
  const failed = rows.filter((r) => r.status === "done" && r.fails.length > 0).length;
  const doneJobs = rows.filter((r) => r.status === "done" && r.jobId !== null);

  function patchRow(index: number, patch: Partial<BatchRow>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleRun(): Promise<void> {
    if (running) return;
    setRunError(null);
    setDownloadError(null);
    if (files.length === 0) {
      setRunError("Нет фото: выберите от 1 до 20 файлов jpg, png или webp.");
      return;
    }
    if (files.length > 20) {
      setRunError(`Слишком много фото: максимум 20 за один батч, а выбрано ${files.length}.`);
      return;
    }
    setRunning(true);
    try {
      // Один запрос создаёт по джобе на файл, дальше прогон строго по очереди:
      // следующий файл стартует только после copy предыдущего.
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("marketplace", marketplace);
      const created = await fetch("/api/jobs", { method: "POST", body: form });
      const createdBody = (await created.json().catch(() => null)) as {
        jobs?: Array<{ id: string; fileName: string }>;
        error?: string;
      } | null;
      if (!created.ok || createdBody?.jobs === undefined) {
        throw new Error(createdBody?.error ?? `джобы не создались (${created.status})`);
      }
      const initial: BatchRow[] = createdBody.jobs.map((j) => ({
        fileName: j.fileName,
        jobId: j.id,
        status: "idle",
        step: "очередь",
        score: null,
        fails: [],
        error: null,
      }));
      setRows(initial);

      for (let i = 0; i < createdBody.jobs.length; i += 1) {
        const job = createdBody.jobs[i];
        if (job === undefined) continue;
        patchRow(i, { status: "running", step: STEP_LABEL.inspect ?? "старт" });
        try {
          let state: JobState | null = null;
          for (const step of STEPS) {
            patchRow(i, { step: STEP_LABEL[step] ?? step });
            const res = await fetch(`/api/jobs/${job.id}/step`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ step }),
            });
            const body = (await res.json().catch(() => null)) as
              | (JobState & { error?: string })
              | { error?: string }
              | null;
            if (!res.ok) {
              const message =
                body !== null && typeof body === "object" && "error" in body && typeof body.error === "string"
                  ? body.error
                  : `шаг «${step}» не прошёл (${res.status})`;
              throw new Error(message);
            }
            state = body as JobState;
          }
          if (state === null) throw new Error("Пустой ответ пайплайна. Попробуйте ещё раз.");
          patchRow(i, {
            status: "done",
            step: "готово",
            score: state.metrics.score,
            fails: failsOf(state),
          });
        } catch (err) {
          patchRow(i, {
            status: "failed",
            step: "ошибка",
            error: err instanceof Error ? err.message : "Шаг упал. Фото цело — запустите батч ещё раз.",
          });
        }
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Батч не запустился. Попробуйте ещё раз.");
    } finally {
      setRunning(false);
    }
  }

  async function handleDownloadAll(): Promise<void> {
    if (downloading || running) return;
    setDownloadError(null);
    if (doneJobs.length === 0) {
      setDownloadError("Пока нечего скачивать: дождитесь хотя бы одной готовой карточки.");
      return;
    }
    setDownloading(true);
    let objectUrl: string | null = null;
    try {
      const encoder = new TextEncoder();
      const inputs: Array<{ name: string; data: Uint8Array }> = [];
      let skipped = 0;
      for (let i = 0; i < doneJobs.length; i += 1) {
        const row = doneJobs[i];
        if (row === undefined || row.jobId === null) continue;
        const folder = `${String(i + 1).padStart(2, "0")}-${slugifyFileName(row.fileName)}`;
        const exportRes = await fetch(`/api/jobs/${row.jobId}/export`);
        if (!exportRes.ok) {
          skipped += 1;
          continue;
        }
        const payload = batchExportSchema.parse(await exportRes.json());
        const [mainBytes, maskBytes] = await Promise.all([
          fetchBytes(`/api/jobs/${row.jobId}/asset/main.jpg`),
          fetchBytes(`/api/jobs/${row.jobId}/asset/mask.png`),
        ]);
        if (mainBytes === null) {
          skipped += 1;
          continue;
        }
        inputs.push({ name: `${folder}/main.jpg`, data: mainBytes });
        if (maskBytes !== null) inputs.push({ name: `${folder}/mask.png`, data: maskBytes });
        inputs.push(
          { name: `${folder}/card.json`, data: encoder.encode(JSON.stringify(payload.copy, null, 2)) },
          { name: `${folder}/card.txt`, data: encoder.encode(payload.cardTxt) },
          {
            name: `${folder}/checklist.json`,
            data: encoder.encode(
              JSON.stringify(
                {
                  id: payload.id,
                  marketplace: payload.marketplace,
                  compliance: payload.compliance,
                  score: payload.score,
                  checklist: payload.checklist,
                },
                null,
                2,
              ),
            ),
          },
        );
      }
      if (inputs.length === 0) {
        throw new Error("Архив пустой: ни одна карточка не отдала файлы. Попробуйте позже.");
      }
      const blob = await buildZip(inputs);
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `batch-${marketplace}-${doneJobs.length}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (skipped > 0) {
        setDownloadError(`Скачалось не всё: пропущено карточек: ${skipped}.`);
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Не скачалось. Попробуйте ещё раз.");
    } finally {
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-950 text-paper">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs font-semibold text-faint">Батч-режим</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight md:text-4xl">
          Каталог за один прогон
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">
          Закиньте от 1 до 20 фото (для каталога — 5–20), выберите площадку и запустите.
          Прогон идёт последовательно, итог — одной строкой: сколько пройдут, сколько надо переснять.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <section aria-label="Настройки батча" className="flex flex-col gap-4">
            <MarketplacePicker value={marketplace} onChange={setMarketplace} />
            <div
              role="button"
              tabIndex={0}
              aria-label="Выбор фото для батча"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-white/20 bg-ink-900 px-6 py-8 text-center transition-colors duration-200 hover:border-white/35 hover:bg-ink-800"
            >
              <p className="font-bold">
                {files.length === 0 ? "Выберите фото" : `Выбрано: ${files.length}`}
              </p>
              <p className="mt-1 text-sm text-muted">jpg, png, webp · до 20 файлов · до 15 МБ каждый</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const list = event.target.files;
                  if (list !== null) setFiles(Array.from(list).slice(0, 20));
                  event.target.value = "";
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => void handleRun()}
                disabled={running || files.length === 0}
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
                {running ? "Прогоняю…" : "Запустить батч"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadAll()}
                disabled={downloading || running || doneJobs.length === 0}
                className={cn(
                  "inline-flex items-center gap-2 rounded-control border border-ink-700 bg-ink-800 px-5 py-3",
                  "text-sm font-semibold text-paper transition-colors duration-200 hover:border-muted",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {downloading ? "Собираю ZIP…" : `Скачать всё (${doneJobs.length})`}
              </button>
            </div>
            {runError !== null && (
              <p role="alert" className="text-sm leading-relaxed text-red-300">
                {runError}
              </p>
            )}
            {downloadError !== null && (
              <p role="alert" className="text-sm leading-relaxed text-red-300">
                {downloadError}
              </p>
            )}
          </section>

          <div className="flex flex-col gap-4">
            <BatchSummary total={rows.length} finished={finished} passed={passed} failed={failed} />
            {rows.length > 0 ? (
              <BatchTable rows={rows} />
            ) : (
              <p className="rounded-card border border-white/10 bg-ink-900 p-5 text-sm leading-relaxed text-muted">
                Таблица появится после запуска: по каждому фото — статус, соответствие из регламента
                и что именно не так.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
