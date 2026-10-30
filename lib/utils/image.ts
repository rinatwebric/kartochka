import sharp from "sharp";
import type { ImageResult } from "../models/types";

// Общие sharp-хелперы для шагов пайплайна: сырые пиксели, размеры, декод ответа модели.

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

export async function readRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

export async function readGrayscaleRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(path)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// sharp в конструкторе требует channels как 1|2|3|4 — сужаем с проверкой.
export function assertChannels(value: number, what: string): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  throw new Error(`Странное число каналов (${value}) в ${what}: ожидалось 1-4.`);
}

// Ответ модели бывает base64 или URL — поддерживаем оба (см. AGENTS.md).
export async function decodeImageResult(result: ImageResult): Promise<Buffer> {
  if (result.b64 !== undefined) return Buffer.from(result.b64, "base64");
  if (result.url !== undefined) {
    const res = await fetch(result.url);
    if (!res.ok) {
      throw new Error(`Не удалось скачать картинку модели (${res.status}): ${result.url}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Модель вернула пустой результат: нет ни base64, ни URL.");
}

// Оценка цвета фона по рамке кадра: медиана пикселей полосы borderPx по периметру.
export function backgroundColorFromBorders(
  raw: RawImage,
  borderPx = 5,
): { r: number; g: number; b: number } {
  const { data, width, height, channels } = raw;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const edge = Math.max(1, Math.min(borderPx, Math.floor(Math.min(width, height) / 4)));
  const push = (x: number, y: number): void => {
    const i = (y * width + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r === undefined || g === undefined || b === undefined) return;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  };
  for (let y = 0; y < height; y += 1) {
    for (let e = 0; e < edge; e += 1) {
      push(e, y);
      push(width - 1 - e, y);
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let e = 0; e < edge; e += 1) {
      push(x, e);
      push(x, height - 1 - e);
    }
  }
  const median = (arr: number[]): number => {
    if (arr.length === 0) return 255;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 255;
  };
  return { r: median(rs), g: median(gs), b: median(bs) };
}
