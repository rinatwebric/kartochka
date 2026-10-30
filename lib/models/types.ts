import { z } from "zod";

export const textVerdictSchema = z.object({
  same: z.boolean(),
  reason: z.string(),
});

export type TextVerdict = z.infer<typeof textVerdictSchema>;

export const imageResultSchema = z.object({
  // Модель может вернуть base64 или URL — поддерживаем оба (см. AGENTS.md).
  b64: z.string().optional(),
  url: z.string().url().optional(),
});

export type ImageResult = z.infer<typeof imageResultSchema>;
