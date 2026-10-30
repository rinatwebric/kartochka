import { isMock } from "../env";
import { callMeta } from "./meta";
import { responsesApiSchema, samResultSchema, type SamResult } from "./types";
import { mockSegment } from "../mock/provider";

export const SAM_MODEL = "sam-3.1";

// Special-token боксы SAM 3.1 (https://dev.meta.ai/docs/sam/reading-segmentation):
// `<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|>`. Координаты — пиксели
// исходника, x2/y2 инклюзивны, w/h — размер исходника на каждом токене.
// Возвращает боксы в нормализованных координатах 0..1 (как SamBox).
const SAM_BOX_RE = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=\d+(?:\.\d+)?)?\|>/g;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function parseSamBoxes(raw: string): Array<{ x: number; y: number; width: number; height: number }> {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const match of raw.matchAll(SAM_BOX_RE)) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    const w = Number(match[5]);
    const h = Number(match[6]);
    if (w <= 0 || h <= 0 || x2 < x1 || y2 < y1) continue;
    const x = clamp01(x1 / w);
    const y = clamp01(y1 / h);
    const width = clamp01((x2 - x1 + 1) / w);
    const height = clamp01((y2 - y1 + 1) / h);
    if (width <= 0 || height <= 0) continue;
    boxes.push({ x, y, width, height });
  }
  return boxes;
}

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
  const boxes = parseSamBoxes(raw);
  return samResultSchema.parse(boxes.length > 0 ? { raw, boxes } : { raw });
}
