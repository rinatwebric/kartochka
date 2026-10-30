import { isMock } from "../env";
import { callMeta } from "./meta";
import { responsesApiSchema, textVerdictSchema, type TextVerdict } from "./types";
import { mockJudge } from "../mock/provider";

export const GLIMMER_MODEL = "muse-glimmer";

function toImageUrl(image: string): string {
  if (image.startsWith("data:") || image.startsWith("http")) return image;
  return `data:image/jpeg;base64,${image}`;
}

function extractText(data: unknown): string {
  const parsed = responsesApiSchema.parse(data);
  const chunks: string[] = [];
  for (const item of parsed.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.length > 0) chunks.push(part.text);
    }
  }
  return chunks.join("\n");
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Модель ${GLIMMER_MODEL} вернула не JSON: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

// Независимый судья идентичности через muse-glimmer: вердикт same true/false.
// Внимание: по документации Glimmer — open-weight для self-host, а не Model API
// (см. docs/DECISIONS.md). Живой вызов идёт на тот же base URL и упадёт, пока
// нет локального рантайма; рабочий режим T2 — MOCK.
export async function judgeIdentity(prompt: string, image?: string): Promise<TextVerdict> {
  if (isMock()) return mockJudge();
  const result = await callMeta<unknown>({
    model: GLIMMER_MODEL,
    path: "/responses",
    body:
      image === undefined
        ? {
            model: GLIMMER_MODEL,
            instructions: 'Отвечай строго JSON {"same": boolean, "reason": string}.',
            input: prompt,
          }
        : {
            model: GLIMMER_MODEL,
            instructions: 'Отвечай строго JSON {"same": boolean, "reason": string}.',
            input: [
              {
                type: "message",
                role: "user",
                content: [
                  { type: "input_text", text: prompt },
                  { type: "input_image", image_url: toImageUrl(image) },
                ],
              },
            ],
          },
  });
  return textVerdictSchema.parse(extractJsonObject(extractText(result.data)));
}
