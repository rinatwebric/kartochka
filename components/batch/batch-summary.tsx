import { Layers, PackageCheck, TriangleAlert } from "lucide-react";

// Итог батча: «12 пройдут, 3 надо переснять» + полоса прогресса.
// Критерий «пройдёт»: джоба done и ни одного красного пункта в чек-листе.
export function BatchSummary({
  total,
  finished,
  passed,
  failed,
}: {
  total: number;
  finished: number;
  passed: number;
  failed: number;
}): React.ReactElement {
  const progress = total === 0 ? 0 : Math.round((finished / total) * 100);
  return (
    <section
      aria-label="Итог батча"
      className="rounded-card border border-white/10 bg-ink-900 p-5 shadow-lift"
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-xs font-semibold text-faint">Фото в батче</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold tabular-nums">
            <Layers className="h-6 w-6 text-accent" aria-hidden="true" />
            {total}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-faint">Пройдут модерацию</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold tabular-nums text-emerald-300">
            <PackageCheck className="h-6 w-6" aria-hidden="true" />
            {passed}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-faint">Надо переснять</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold tabular-nums text-red-300">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
            {failed}
          </p>
        </div>
        <p className="ml-auto max-w-[32ch] text-sm leading-relaxed text-muted">
          {total === 0
            ? "Добавьте фото — итог появится после прогона."
            : `${passed} пройдут, ${failed} надо переснять`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Прогресс батча"
        className="mt-4 h-2 overflow-hidden rounded-full bg-ink-700"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs tabular-nums text-faint">
        Готово {finished} из {total} · {progress}%
      </p>
    </section>
  );
}
