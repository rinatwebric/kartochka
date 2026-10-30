import { isMock } from "../env";
import { callMeta } from "./meta";
import { responsesApiSchema, samResultSchema, type SamResult } from "./types";
import { mockSegment } from "../mock/provider";

export const SAM_MODEL = "sam-3.1";

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

// Маска товара через sam-3.1: короткий noun-phrase промпт + фото (base64 или URL).
export async function segmentWithSam(image: string, prompt: string): Promise<SamResult> {
  if (isMock()) return mockSegment();
  const result = await callMeta<unknown>({
    model: SAM_MODEL,
    path: "/responses",
    body: {
      model: SAM_MODEL,
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
  const raw = extractText(result.data);
  return samResultSchema.parse({ raw });
}
