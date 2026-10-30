import { z } from "zod";
import {
  checklistItemSchema,
  composeResultSchema,
  copySchema,
  type ChecklistItem,
} from "./types";

// Клиент-безопасная часть экспорта: только zod-схемы и имена файлов,
// без node:fs. Полная сборка payload — в ./export (сервер).
// Сюда ходит components/studio/result-actions.tsx, чтобы не тянуть
// node:fs в браузерный бандл (см. DECISIONS T6).

export const EXPORT_FILES = ["main.jpg", "mask.png", "card.json", "card.txt", "checklist.json"] as const;

export const exportPayloadSchema = z.object({
  id: z.string().min(1),
  marketplace: z.string().min(1),
  copy: copySchema,
  checklist: z.array(checklistItemSchema),
  compliance: z.number(),
  score: z.number(),
  metrics: z.object({
    identity: z.number(),
    compliance: z.number(),
    retries: z.number(),
    productFill: z.number(),
    score: z.number(),
    credits: z.number(),
    ms: z.number(),
  }),
  promptIds: z.object({
    compose: z.string(),
    identity: z.string(),
    copy: z.string(),
  }),
  cardTxt: z.string().min(1),
  assets: z.object({
    main: z.string().min(1),
    mask: z.string().nullable(),
  }),
});
export type ExportPayload = z.infer<typeof exportPayloadSchema>;

export type { ChecklistItem };
export { checklistItemSchema, composeResultSchema };
