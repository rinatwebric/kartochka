import type { ImageResult } from "./types";

// TODO(T2): генерация фона/кадров через muse-image-1.0, zod-валидация ответа.
export async function generateImage(_prompt: string): Promise<ImageResult> {
  throw new Error("TODO(T2): image wrapper not implemented");
}
