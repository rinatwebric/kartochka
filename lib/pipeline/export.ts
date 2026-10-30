import { z } from "zod";
import { copySchema, formatCardTxt, type Copy } from "./copy";
import { loadJob, readStepResult, StepError } from "./state";
import { checklistItemSchema, composeResultSchema, type ChecklistItem } from "./types";
import { EXPORT_FILES, exportPayloadSchema, type ExportPayload } from "./export-schema";

export { EXPORT_FILES, exportPayloadSchema };
export type { ExportPayload };

// Экспорт T6: сервер отдаёт данные и файлы, а ZIP собирает браузер
// (см. MASTER.md 3 и DECISIONS: сервер не участвует в сборке архива).
// Схемы и имена файлов живут в ./export-schema (без node:fs), чтобы
// клиентский ResultActions мог их импортировать без node:fs в бандле.

export interface ExportFiles {
  cardJson: string;
  cardTxt: string;
  checklistJson: string;
}

// card.json: всё для восстановления карточки без сервера.
export function buildCardJson(args: {
  id: string;
  marketplace: string;
  copy: Copy;
  promptIds: { compose: string; identity: string; copy: string };
}): string {
  return `${JSON.stringify(
    {
      id: args.id,
      marketplace: args.marketplace,
      title: args.copy.title,
      description: args.copy.description,
      specs: args.copy.specs,
      promptIds: args.promptIds,
    },
    null,
    2,
  )}\n`;
}

// checklist.json: регламент как данные для сводных отчётов.
export function buildChecklistJson(args: {
  id: string;
  marketplace: string;
  compliance: number;
  score: number;
  checklist: ChecklistItem[];
}): string {
  return `${JSON.stringify(
    {
      id: args.id,
      marketplace: args.marketplace,
      compliance: args.compliance,
      score: args.score,
      checklist: args.checklist,
    },
    null,
    2,
  )}\n`;
}

export function buildExportFiles(args: {
  id: string;
  marketplace: string;
  copy: Copy;
  checklist: ChecklistItem[];
  compliance: number;
  score: number;
  promptIds: { compose: string; identity: string; copy: string };
}): ExportFiles {
  const cardTxt = formatCardTxt(args.copy);
  return {
    cardJson: buildCardJson({
      id: args.id,
      marketplace: args.marketplace,
      copy: args.copy,
      promptIds: args.promptIds,
    }),
    cardTxt,
    checklistJson: buildChecklistJson({
      id: args.id,
      marketplace: args.marketplace,
      compliance: args.compliance,
      score: args.score,
      checklist: args.checklist,
    }),
  };
}

// Полезная нагрузка GET /api/jobs/{id}/export: текст, чек-лист и ссылки
// на бинари. Бинари клиент дотягивает из /api/jobs/{id}/asset/{name}.
export async function buildExportPayload(jobId: string): Promise<ExportPayload> {
  const job = await loadJob(jobId);
  if (job.copy.title.length === 0) {
    throw new StepError(409, "Сначала выполните copy: текст карточки ещё не написан.", ["copy"]);
  }
  if (job.assets.main === undefined) {
    throw new StepError(409, "Сначала выполните whitebg: главного кадра пока нет.", [
      "compose",
      "whitebg",
    ]);
  }
  const compose = await readStepResult<unknown>(jobId, "compose");
  const composeParsed = compose === null ? null : composeResultSchema.safeParse(compose);
  const files = buildExportFiles({
    id: job.id,
    marketplace: job.marketplace,
    copy: job.copy,
    checklist: job.checklist,
    compliance: job.metrics.compliance,
    score: job.metrics.score,
    promptIds: job.promptIds,
  });
  return exportPayloadSchema.parse({
    id: job.id,
    marketplace: job.marketplace,
    copy: job.copy,
    checklist: job.checklist,
    compliance: job.metrics.compliance,
    score: job.metrics.score,
    metrics: job.metrics,
    promptIds: job.promptIds,
    cardTxt: files.cardTxt,
    assets: {
      main: `/api/jobs/${job.id}/asset/main.jpg`,
      mask: composeParsed !== null && composeParsed.success
        ? `/api/jobs/${job.id}/asset/mask.png`
        : null,
    },
  });
}
