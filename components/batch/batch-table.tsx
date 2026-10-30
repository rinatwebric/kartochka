import { CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Строка батча: фото / статус / соответствие / что не так.
// Презентационный компонент — прогоном управляет app/batch/page.tsx.
export interface BatchRow {
  fileName: string;
  jobId: string | null;
  status: "idle" | "running" | "done" | "failed";
  step: string;
  score: number | null;
  fails: string[];
  error: string | null;
}

function StatusBadge({ row }: { row: BatchRow }): React.ReactElement {
  if (row.status === "done") {
    const passed = row.fails.length === 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 text-xs font-bold",
          passed ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300",
        )}
      >
        {passed ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {passed ? "Пройдёт" : "Не пройдёт"}
      </span>
    );
  }
  if (row.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-red-400/15 px-2.5 py-1 text-xs font-bold text-red-300">
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Ошибка
      </span>
    );
  }
  if (row.status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-chip bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {row.step}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-chip bg-ink-800 px-2.5 py-1 text-xs font-bold text-faint">
      <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Ждёт
    </span>
  );
}

export function BatchTable({ rows }: { rows: BatchRow[] }): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-card border border-white/10 bg-ink-900">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs font-semibold text-faint">
            <th scope="col" className="px-4 py-3">Фото</th>
            <th scope="col" className="px-4 py-3">Статус</th>
            <th scope="col" className="px-4 py-3 tabular-nums">Соответствие</th>
            <th scope="col" className="px-4 py-3">Что не так</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.fileName} className="border-b border-white/5 transition-colors last:border-0 hover:bg-accent/[0.04]">
              <td className="max-w-[220px] truncate px-4 py-3 font-medium text-paper">
                {row.jobId !== null ? (
                  <a
                    href={`/studio/${row.jobId}`}
                    className="underline decoration-white/20 underline-offset-4 hover:decoration-accent"
                  >
                    {row.fileName}
                  </a>
                ) : (
                  row.fileName
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge row={row} />
              </td>
              <td className="px-4 py-3 tabular-nums text-paper">
                {row.score === null ? "—" : `${row.score} / 100`}
              </td>
              <td className="px-4 py-3 text-muted">
                {row.error !== null
                  ? row.error
                  : row.status === "done"
                    ? row.fails.length === 0
                      ? "Всё по регламенту"
                      : row.fails.join("; ")
                    : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
