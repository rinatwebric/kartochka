import { z } from "zod";
import { isMock } from "../env";
import { callMeta } from "./meta";
import { responsesApiSchema } from "./types";
import { mockAsk } from "../mock/provider";

export const SPARK_MODEL = "muse-spark-1.3";

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

const nonEmptyText = z.string().min(1);

// Текст и vision-вопросы через muse-spark: обычный текст или текст+фото.
export async function askSpark(prompt: string, image?: string): Promise<string> {
  if (isMock()) return mockAsk();
  const result = await callMeta<unknown>({
    model: SPARK_MODEL,
    path: "/responses",
    body:
      image === undefined
        ? { model: SPARK_MODEL, input: prompt }
        : {
            model: SPARK_MODEL,
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
  return nonEmptyText.parse(extractText(result.data));
}
