import { dirname, join, parse } from "node:path";
import sharp from "sharp";
import { assertChannels, readRaw } from "../utils/image";
import { whitebgResultSchema, type Bbox, type WhitebgResult } from "./types";

// White-bg fixer: всё вне маски — ровно (255,255,255), край товара не трогаем.
// Пороги из MASTER.md 8 и rules/wb.json: эрозия 1-2 px, min_channel 250,
// доля белых вне маски >= 0.99. Выход — PNG: JPEG на плоском белом даёт
// ровно 255 только вдали от края, нам нужна битовая точность везде.
export const WHITEBG_ERODE_PX = 2;
export const WHITEBG_MIN_CHANNEL = 250;
export const WHITEBG_BG_WHITE_NORM = 0.99;
export const WHITEBG_EDGE_DIFF = 8;
export const WHITEBG_MAX_CHANGED_INSIDE = 0.02;

export function whitebgPathFor(composedPath: string): string {
  return join(dirname(composedPath), `${parse(composedPath).name}.white.png`);
}

function erode(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let cur = mask;
  for (let it = 0; it < iterations; it += 1) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((cur[y * width + x] ?? 0) !== 1) continue;
        let keep = true;
        for (let dy = -1; dy <= 1 && keep; dy += 1) {
          for (let dx = -1; dx <= 1 && keep; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if ((cur[ny * width + nx] ?? 0) !== 1) keep = false;
          }
        }
        next[y * width + x] = keep ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

function bboxOfMask(mask: Uint8Array, width: number, height: number): Bbox | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) === 1) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function isWhitePixel(data: Buffer, i: number): boolean {
  return (
    (data[i] ?? 0) >= WHITEBG_MIN_CHANNEL &&
    (data[i + 1] ?? 0) >= WHITEBG_MIN_CHANNEL &&
    (data[i + 2] ?? 0) >= WHITEBG_MIN_CHANNEL
  );
}

// Доля белых пикселей вне маски (норма >= 0.99) — та же метрика, что в rules.
export function bgWhiteShare(image: Buffer, width: number, height: number, mask: Uint8Array): number {
  let outside = 0;
  let white = 0;
  for (let p = 0; p < width * height; p += 1) {
    if ((mask[p] ?? 0) === 1) continue;
    outside += 1;
    if (isWhitePixel(image, p * 3)) white += 1;
  }
  if (outside === 0) return 0;
  return white / outside;
}

// Доля изменённых пикселей внутри bbox товара: проверка «край не съеден».
export function changedInsideShare(
  before: Buffer,
  after: Buffer,
  bbox: Bbox,
  width: number,
): number {
  let total = 0;
  let changed = 0;
  for (let y = bbox.y; y < bbox.y + bbox.height; y += 1) {
    for (let x = bbox.x; x < bbox.x + bbox.width; x += 1) {
      total += 1;
      const i = (y * width + x) * 3;
      const d = Math.max(
        Math.abs((before[i] ?? 0) - (after[i] ?? 0)),
        Math.abs((before[i + 1] ?? 0) - (after[i + 1] ?? 0)),
        Math.abs((before[i + 2] ?? 0) - (after[i + 2] ?? 0)),
      );
      if (d > WHITEBG_EDGE_DIFF) changed += 1;
    }
  }
  if (total === 0) return 1;
  return changed / total;
}

export async function fixWhiteBg(
  composedPath: string,
  maskPath: string,
): Promise<WhitebgResult> {
  const [src, maskRaw] = await Promise.all([readRaw(composedPath), readRaw(maskPath)]);
  if (src.channels < 3) {
    throw new Error(`Кадр без цвета: ${composedPath}. Ожидался RGB.`);
  }
  const rgb = Buffer.alloc(src.width * src.height * 3);
  for (let p = 0; p < src.width * src.height; p += 1) {
    rgb[p * 3] = src.data[p * src.channels] ?? 255;
    rgb[p * 3 + 1] = src.data[p * src.channels + 1] ?? 255;
    rgb[p * 3 + 2] = src.data[p * src.channels + 2] ?? 255;
  }
  // Маску приводим к размеру кадра ближайшим соседом.
  let maskScaled: Buffer;
  let maskW = maskRaw.width;
  let maskH = maskRaw.height;
  if (maskRaw.width !== src.width || maskRaw.height !== src.height) {
    const maskChannels = assertChannels(maskRaw.channels, "маске");
    const resized = await sharp(maskRaw.data, {
      raw: { width: maskRaw.width, height: maskRaw.height, channels: maskChannels },
    })
      .resize(src.width, src.height, { fit: "fill", kernel: "nearest" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    maskScaled = resized.data;
    maskW = resized.info.width;
    maskH = resized.info.height;
  } else {
    maskScaled = maskRaw.data;
  }
  const mask = new Uint8Array(src.width * src.height);
  const mStep = maskScaled.length / (maskW * maskH);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = (maskScaled[Math.floor(i * mStep)] ?? 0) > 128 ? 1 : 0;
  }

  let fg = 0;
  for (const v of mask) fg += v;
  const fgFrac = fg / mask.length;
  const bbox = bboxOfMask(mask, src.width, src.height);
  const degenerate = bbox === null || fgFrac < 0.02 || fgFrac > 0.98;

  const eroded = degenerate ? new Uint8Array(mask.length) : erode(mask, src.width, src.height, WHITEBG_ERODE_PX);
  const out = Buffer.alloc(rgb.length);
  for (let p = 0; p < mask.length; p += 1) {
    if ((eroded[p] ?? 0) === 1) {
      out[p * 3] = rgb[p * 3] ?? 255;
      out[p * 3 + 1] = rgb[p * 3 + 1] ?? 255;
      out[p * 3 + 2] = rgb[p * 3 + 2] ?? 255;
    } else {
      out[p * 3] = 255;
      out[p * 3 + 1] = 255;
      out[p * 3 + 2] = 255;
    }
  }

  const changedInside =
    bbox === null ? 1 : changedInsideShare(rgb, out, bbox, src.width);
  // Край съеден, если внутри bbox много изменений, или маска вырождена
  // (тогда fixer залил бы белым сам товар).
  if (degenerate || changedInside > WHITEBG_MAX_CHANGED_INSIDE) {
    const bgWhite = bgWhiteShare(rgb, src.width, src.height, mask);
    return whitebgResultSchema.parse({
      outPath: composedPath,
      bgWhite,
      changedInside,
      edgePreserved: false,
      rolledBack: true,
    });
  }
  const outPath = whitebgPathFor(composedPath);
  await sharp(out, { raw: { width: src.width, height: src.height, channels: 3 } })
    .png()
    .toFile(outPath);
  const bgWhite = bgWhiteShare(out, src.width, src.height, mask);
  return whitebgResultSchema.parse({
    outPath,
    bgWhite,
    changedInside,
    edgePreserved: true,
    rolledBack: false,
  });
}
