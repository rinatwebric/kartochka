import { z } from "zod";

export const textVerdictSchema = z.object({
  same: z.boolean(),
  reason: z.string().min(1),
});

export type TextVerdict = z.infer<typeof textVerdictSchema>;

export const imageResultSchema = z
  .object({
    // Модель может вернуть base64 или URL — поддерживаем оба (см. AGENTS.md).
    b64: z.string().min(1).optional(),
    url: z.string().url().optional(),
  })
  .refine((v) => v.b64 !== undefined || v.url !== undefined, {
    message: "image result must contain b64 or url",
  });

export type ImageResult = z.infer<typeof imageResultSchema>;

export const samResultSchema = z.object({
  // SAM 3.1 через Responses API отдаёт special-token текст с боксами и масками
  // (см. docs/DECISIONS.md): сырой текст обязателен, геометрия — по мере парсинга.
  raw: z.string().min(1),
  boxes: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
    )
    .optional(),
  mask: imageResultSchema.optional(),
});

export type SamResult = z.infer<typeof samResultSchema>;

// Минимальная схема ответа Responses API (POST /v1/responses), достаточная для
// извлечения текста и usage. Неизвестные поля игнорируем.
const responsesContentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

const responsesOutputItemSchema = z.object({
  type: z.string(),
  role: z.string().optional(),
  content: z.array(responsesContentPartSchema).optional(),
});

export const responsesApiSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  output: z.array(responsesOutputItemSchema).optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export type ResponsesApi = z.infer<typeof responsesApiSchema>;

// Минимальная схема ответа Images API (POST /v1/images/generations|edits).
export const imagesApiSchema = z.object({
  created: z.number().optional(),
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .min(1),
  output_format: z.string().optional(),
});

export type ImagesApi = z.infer<typeof imagesApiSchema>;
