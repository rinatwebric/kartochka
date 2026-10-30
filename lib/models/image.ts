import { isMock } from "../env";
import { callMeta } from "./meta";
import { imageResultSchema, imagesApiSchema, type ImageResult } from "./types";
import { mockGenerate } from "../mock/provider";

export const IMAGE_MODEL = "muse-image-1.0";

export interface GenerateImageInput {
  prompt: string;
  image?: string;
  size?: string;
}

function toImageUrl(image: string): string {
  if (image.startsWith("data:") || image.startsWith("http")) return image;
  return `data:image/jpeg;base64,${image}`;
}

// Генерация/правка через muse-image-1.0: без image — /images/generations,
// с image — /images/edits (JSON-форма с images[], см. docs/DECISIONS.md).
export async function generateImage(input: GenerateImageInput): Promise<ImageResult> {
  if (isMock()) return mockGenerate();
  if (input.image !== undefined) {
    const result = await callMeta<unknown>({
      model: IMAGE_MODEL,
      path: "/images/edits",
      body: {
        model: IMAGE_MODEL,
        prompt: input.prompt,
        images: [{ image_url: toImageUrl(input.image) }],
        n: 1,
        response_format: "b64_json",
        ...(input.size !== undefined ? { size: input.size } : {}),
      },
    });
    const parsed = imagesApiSchema.parse(result.data);
    const first = parsed.data[0];
    if (first === undefined) throw new Error(`Модель ${IMAGE_MODEL} вернула пустой data.`);
    return imageResultSchema.parse({ b64: first.b64_json, url: first.url });
  }
  const result = await callMeta<unknown>({
    model: IMAGE_MODEL,
    path: "/images/generations",
    body: {
      model: IMAGE_MODEL,
      prompt: input.prompt,
      n: 1,
      response_format: "b64_json",
      ...(input.size !== undefined ? { size: input.size } : {}),
    },
  });
  const parsed = imagesApiSchema.parse(result.data);
  const first = parsed.data[0];
  if (first === undefined) throw new Error(`Модель ${IMAGE_MODEL} вернула пустой data.`);
  return imageResultSchema.parse({ b64: first.b64_json, url: first.url });
}
