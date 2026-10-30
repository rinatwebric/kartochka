import { dirname, join, parse } from "node:path";
import sharp from "sharp";
import { segmentWithSam } from "../models/sam";
import { getActivePromptSet } from "../prompts/registry";
import { decodeImageResult } from "../utils/image";
import { backgroundColorFromBorders, type RawImage } from "../utils/image";
import {
  segmentResultSchema,
  type Bbox,
  type SamBox,
  type SegmentResult,
} from "./types";

// Цепочка маски: sam-mask -> sam-boxes -> background-removal.
// Живой формат SAM-маски (special-token) без ключа не виден, а mock-фикстура 1x1
// для пикселей непригодна — поэтому детерминированный фолбэк обязателен
// (вариант B из MASTER.md 6.1: пиксели считаются, а не рисуются).
export const SEGMENT_WORK_MAX_SIDE = 480;
export const SEGMENT_BG_DIFF_THRESHOLD = 32;
export const SEGMENT_MIN_FOREGROUND = 0.02;
export const SEGMENT_MAX_FOREGROUND = 0.95;

export function maskPathFor(sourcePath: string): string {
  return join(dirname(sourcePath), `${parse(sourcePath).name}.mask.png`);
}

function unionOfBoxes(boxes: SamBox[]): Bbox | null {
  const valid = boxes.filter((b) => b.width > 0 && b.height > 0);
  if (valid.length === 0) return null;
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const b of valid) {
    x0 = Math.min(x0, Math.max(0, b.x));
    y0 = Math.min(y0, Math.max(0, b.y));
    x1 = Math.max(x1, Math.min(1, b.x + b.width));
    y1 = Math.max(y1, Math.min(1, b.y + b.height));
  }
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function bboxOfMask(mask: Uint8Array, width: number, height: number): Bbox | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) === 1) {
        count += 1;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (count === 0) return null;
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// Морфологическое открытие 3x3: убирает одиночный шум, не трогая крупные области.
function morphOpen(mask: Uint8Array, width: number, height: number): Uint8Array {
  const eroded = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy += 1) {
        for (let dx = -1; dx <= 1 && all; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if ((mask[ny * width + nx] ?? 0) !== 1) all = false;
        }
      }
      eroded[y * width + x] = all ? 1 : 0;
    }
  }
  const opened = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let found = false;
      for (let dy = -1; dy <= 1 && !found; dy += 1) {
        for (let dx = -1; dx <= 1 && !found; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if ((eroded[ny * width + nx] ?? 0) === 1) found = true;
        }
      }
      opened[y * width + x] = found ? 1 : 0;
    }
  }
  return opened;
}

// Детерминированная маска по цвету фона с краёв кадра. Работает на уменьшенной
// копии ради скорости, результат возвращается в координатах исходника.
// Экспортирована для точечной проверки фолбэка без SAM.
export async function backgroundRemovalMask(sourcePath: string): Promise<Uint8Array | null> {
  const meta = await sharp(sourcePath).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW <= 0 || srcH <= 0) return null;
  const scale = Math.min(1, SEGMENT_WORK_MAX_SIDE / Math.max(srcW, srcH));
  const workW = Math.max(1, Math.round(srcW * scale));
  const workH = Math.max(1, Math.round(srcH * scale));
  const { data, info } = await sharp(sourcePath)
    .resize(workW, workH, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: RawImage = { data, width: info.width, height: info.height, channels: info.channels };
  const bg = backgroundColorFromBorders(raw);
  const mask = new Uint8Array(workW * workH);
  let fg = 0;
  for (let y = 0; y < workH; y += 1) {
    for (let x = 0; x < workW; x += 1) {
      const i = (y * workW + x) * raw.channels;
      const dr = Math.abs((data[i] ?? 0) - bg.r);
      const dg = Math.abs((data[i + 1] ?? 0) - bg.g);
      const db = Math.abs((data[i + 2] ?? 0) - bg.b);
      const isFg = Math.max(dr, dg, db) > SEGMENT_BG_DIFF_THRESHOLD ? 1 : 0;
      mask[y * workW + x] = isFg;
      fg += isFg;
    }
  }
  const frac = fg / (workW * workH);
  if (frac < SEGMENT_MIN_FOREGROUND || frac > SEGMENT_MAX_FOREGROUND) return null;
  const opened = morphOpen(mask, workW, workH);
  // Масштабируем бинарную маску обратно к исходнику ближайшим соседом.
  const full = new Uint8Array(srcW * srcH);
  for (let y = 0; y < srcH; y += 1) {
    const sy = Math.min(workH - 1, Math.floor((y * workH) / srcH));
    for (let x = 0; x < srcW; x += 1) {
      const sx = Math.min(workW - 1, Math.floor((x * workW) / srcW));
      full[y * srcW + x] = opened[sy * workW + sx] ?? 0;
    }
  }
  return full;
}

function rectMaskFromBoxes(
  boxes: SamBox[],
  width: number,
  height: number,
): { mask: Uint8Array; bbox: Bbox } | null {
  const union = unionOfBoxes(boxes);
  if (union === null) return null;
  const x0 = Math.floor(union.x * width);
  const y0 = Math.floor(union.y * height);
  const x1 = Math.min(width, Math.ceil((union.x + union.width) * width));
  const y1 = Math.min(height, Math.ceil((union.y + union.height) * height));
  if (x1 <= x0 || y1 <= y0) return null;
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) mask[y * width + x] = 1;
  }
  return { mask, bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}

async function samMaskPixels(
  sourcePath: string,
  maskB64: string,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  let buf: Buffer;
  try {
    buf = await decodeImageResult({ b64: maskB64 });
  } catch {
    return null;
  }
  try {
    const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
    if (info.width < 2 || info.height < 2) return null;
    // Маска от модели может не совпадать по размеру (mock отдаёт 1x1) —
    // такую маску пикселями считать нельзя, только боксы.
    if (info.width * info.height < width * height * 0.01) return null;
    const { data: scaled } = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) mask[i] = (scaled[i] ?? 0) > 128 ? 1 : 0;
    return mask;
  } catch {
    return null;
  }
}

async function saveMaskPng(mask: Uint8Array, width: number, height: number, outPath: string): Promise<void> {
  const pixels = Buffer.alloc(width * height);
  for (let i = 0; i < mask.length; i += 1) pixels[i] = (mask[i] ?? 0) === 1 ? 255 : 0;
  await sharp(pixels, { raw: { width, height, channels: 1 } }).png().toFile(outPath);
}

// Segment: маска товара по промпту категории, mask.png рядом с исходником.
// В mock-режиме SAM отдаёт только боксы — прямоугольная маска строится по ним;
// в живом режиме пробуется пиксельная маска модели, иначе тот же фолбэк.
export async function segmentProduct(
  sourcePath: string,
  category = "product",
): Promise<SegmentResult> {
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Фото без размеров: ${sourcePath}. Файл, похоже, повреждён.`);
  }
  const { readFile } = await import("node:fs/promises");
  const sourceB64 = (await readFile(sourcePath)).toString("base64");

  let boxes: SamBox[] | undefined;
  let mask: Uint8Array | null = null;
  let method: SegmentResult["method"] = "background-removal";
  try {
    const prompt = getActivePromptSet().segmentPrompt(category);
    const sam = await segmentWithSam(sourceB64, prompt);
    if (sam.mask?.b64 !== undefined) {
      mask = await samMaskPixels(sourcePath, sam.mask.b64, width, height);
      if (mask !== null) method = "sam-mask";
    }
    if (mask === null && sam.boxes !== undefined && sam.boxes.length > 0) {
      boxes = sam.boxes;
      const rect = rectMaskFromBoxes(sam.boxes, width, height);
      if (rect !== null) {
        mask = rect.mask;
        method = "sam-boxes";
      }
    }
  } catch {
    // Модель недоступна — идём в детерминированный фолбэк, шаг не роняем.
    mask = null;
  }
  if (mask === null) {
    mask = await backgroundRemovalMask(sourcePath);
    method = "background-removal";
  }
  if (mask === null) {
    throw new Error(
      `Не получилось выделить товар на фото: ${sourcePath}. Попробуйте снять на более контрастном фоне.`,
    );
  }
  const bbox = bboxOfMask(mask, width, height);
  if (bbox === null) {
    throw new Error(
      `Маска товара пустая: ${sourcePath}. Попробуйте снять на более контрастном фоне.`,
    );
  }
  const maskPath = maskPathFor(sourcePath);
  await saveMaskPng(mask, width, height, maskPath);
  return segmentResultSchema.parse({
    maskPath,
    bbox,
    fill: (bbox.width * bbox.height) / (width * height),
    maskWidth: width,
    maskHeight: height,
    method,
    ...(boxes !== undefined ? { samBoxes: boxes } : {}),
  });
}
