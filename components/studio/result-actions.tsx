"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { EXPORT_FILES, exportPayloadSchema } from "@/lib/pipeline/export";
import { buildZip } from "@/lib/utils/zip";
import { cn } from "@/lib/utils/cn";

interface ResultActionsProps {
  jobId: string;
  marketplace: string;
  title: string;
  description: string;
  specs: Record<string, string>;
}

// Транслит для имени архива: <marketplace>-<slug>.zip.
const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
  "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
  "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
};

export function slugifyTitle(title: string): string {
  const lowered = title.toLowerCase();
  let out = "";
  for (const ch of lowered) {
    if (ch >= "a" && ch <= "z") out += ch;
    else if (ch >= "0" && ch <= "9") out += ch;
    else if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (ch === " " || ch === "-" || ch === "_") out += "-";
  }
  const slug = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug.length > 0 ? slug : "card";
}

function formatCardText(title: string, description: string, specs: Record<string, string>): string {
  const lines: string[] = [title, "", description, "", "Характеристики:"];
  for (const [key, value] of Object.entries(specs)) {
    lines.push(`- ${key}: ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`файл ${url} не загрузился (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export function ResultActions({
  jobId,
  marketplace,
  title,
  description,
  specs,
}: ResultActionsProps): React.ReactElement {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    };
  }, []);

  async function handleDownload(): Promise<void> {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    let objectUrl: string | null = null;
    try {
      const exportRes = await fetch(`/api/jobs/${jobId}/export`);
      if (!exportRes.ok) {
        const body = (await exportRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `экспорт не собрался (${exportRes.status})`);
      }
      const payload = exportPayloadSchema.parse(await exportRes.json());

      const [mainBytes, maskBytes] = await Promise.all([
        fetchBytes(`/api/jobs/${jobId}/asset/main.jpg`),
        fetchBytes(`/api/jobs/${jobId}/asset/mask.png`),
      ]);
      if (mainBytes === null) {
        throw new Error("главный кадр ещё не готов: дождитесь конца прогона");
      }
      const files: Array<{ name: (typeof EXPORT_FILES)[number]; data: Uint8Array }> = [
        { name: "main.jpg", data: mainBytes },
      ];
      if (maskBytes !== null) files.push({ name: "mask.png", data: maskBytes });
      const encoder = new TextEncoder();
      files.push(
        { name: "card.json", data: encoder.encode(JSON.stringify(payload.copy, null, 2)) },
        { name: "card.txt", data: encoder.encode(payload.cardTxt) },
        {
          name: "checklist.json",
          data: encoder.encode(
            JSON.stringify(
              { id: payload.id, marketplace: payload.marketplace, compliance: payload.compliance, score: payload.score, checklist: payload.checklist },
              null,
              2,
            ),
          ),
        },
      );
      // Порядок как в ТЗ: картинки, затем тексты.
      const order = new Map(EXPORT_FILES.map((name, i) => [name, i]));
      files.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));

      const blob = await buildZip(files);
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${marketplace}-${slugifyTitle(payload.copy.title)}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Не скачалось. Попробуйте ещё раз.");
    } finally {
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
      setDownloading(false);
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatCardText(title, description, specs));
    } catch {
      setDownloadError("Не скопировалось: разрешите доступ к буферу обмена и попробуйте снова.");
      return;
    }
    setCopied(true);
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section aria-label="Экспорт карточки" className="rounded-card border border-ink-700 bg-ink-900 p-5 shadow-lift">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-paper">Готовый результат</h2>
          <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">
            ZIP с кадром, маской и текстом — площадки принимают такой набор с первого раза.
            Внутри пять файлов: кадр, маска, текст и чек-лист.
          </p>
        </div>
        <span className="rounded-chip bg-ink-800 px-2.5 py-1 text-xs font-medium text-faint">
          {marketplace} · zip
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading || title.length === 0}
          className={cn(
            "inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2.5",
            "text-sm font-semibold text-accent-ink shadow-flat",
            "transition-colors duration-200 hover:bg-accent-soft",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {downloading ? "Собираю ZIP…" : "Скачать ZIP"}
        </button>

        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={title.length === 0}
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 rounded-control border border-ink-700 bg-ink-800 px-4 py-2.5",
            "text-sm font-medium text-paper transition-colors duration-200 hover:border-muted",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {copied ? (
            <Check className="h-4 w-4 text-accent" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Скопировано" : "Скопировать текст"}
        </button>
      </div>

      {downloadError !== null && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-red-300">
          {downloadError}
        </p>
      )}
    </section>
  );
}
