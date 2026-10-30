import { readFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { assertChannels, readRaw } from "../utils/image";
import {
  composeResultSchema,
  type Bbox,
  type ComposeResult,
  type Marketplace,
} from "./types";

// Compose детерминированный (вариант B из MASTER.md 6.1): товар вырезается по
// маске и кладётся на белый холст нужной пропорции. Генеративная заливка через
// muse-image-1.0 осознанно не вызывается: она рвёт соответствие маски и кадра,
// а регламенту нужны считаемые пиксели. modelUsed=false фиксирует это честно.
export const COMPOSE_DEFAULT_TARGET = { width: 900, height: 1200 } as const;
export const COMPOSE_DEFAULT_FILL = 0.75;
export const COMPOSE_JPEG_QUALITY = 92;

const rulesCheckSchema = z.object({
  id: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const rulesFileSchema = z.object({
  aspect: z
    .object({ target: z.array(z.number()).optional() })
    .partial()
    .optional(),
  checks: z.array(rulesCheckSchema).optional(),
});

export interface ComposeTarget {
  width: number;
  height: number;
  targetFill: number;
}

export async function readComposeTarget(marketplace: Marketplace): Promise<ComposeTarget> {
  const fallback: ComposeTarget = {
    width: COMPOSE_DEFAULT_TARGET.width,
    height: COMPOSE_DEFAULT_TARGET.height,
    targetFill: COMPOSE_DEFAULT_FILL,
  };
  let raw: unknown;
  try {
    const text = await readFile(join(process.cwd(), "rules", `${marketplace}.json`), "utf-8");
    raw = JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
  const parsed = rulesFileSchema.safeParse(raw);
  if (!parsed.success) return fallback;
  const t = parsed.data.aspect?.target;
  const width = t !== undefined && t[0] !== undefined && t[0] > 0 ? Math.round(t[0]) : fallback.width;
  const height = t !== undefined && t[1] !== undefined && t[1] > 0 ? Math.round(t[1]) : fallback.height;
  let targetFill = fallback.targetFill;
  const fillCheck = parsed.data.checks?.find((c) => c.id === "fill");
  const min = fillCheck?.params?.["min"];
  const max = fillCheck?.params?.["max"];
  if (typeof min === "number" && typeof max === "number" && min > 0 && max > min) {
    targetFill = Math.min(0.98, Math.max(0.05, (min + max) / 2));
  }
  return { width, height, targetFill };
}

export function outputPathsFor(sourcePath: string): { mainPath: string; maskPath: string } {
  const dir = dirname(sourcePath);
  const base = parse(sourcePath).name;
  return { mainPath: join(dir, `${base}.main.jpg`), maskPath: join(dir, `${base}.main.mask.png`) };
}

function bboxOfMask(mask: Uint8Array, width: number, height: number): Bbox {
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
  if (x1 < x0 || y1 < y0) {
    throw new Error("Маска товара пустая: нечего компоновать. Перезапустите segment.");
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// Товар в кадре на целевую долю: масштаб по площади bbox, кроп окном той же
// пропорции, что холст, затем центрирование на белом.
export async function composeCard(
  sourcePath: string,
  maskPath: string,
  marketplace: Marketplace = "wb",
): Promise<ComposeResult> {
  const target = await readComposeTarget(marketplace);
  const [src, maskRaw] = await Promise.all([readRaw(sourcePath), readRaw(maskPath)]);
  if (src.channels < 3) {
    throw new Error(`Фото без цвета: ${sourcePath}. Нужен RGB-кадр.`);
  }
  // Маску приводим к размеру исходника ближайшим соседом.
  let maskScaled: Buffer;
  if (maskRaw.width === src.width && maskRaw.height === src.height) {
    maskScaled = maskRaw.data;
  } else {
    const maskChannels = assertChannels(maskRaw.channels, "маске");
    const resized = await sharp(maskRaw.data, {
      raw: { width: maskRaw.width, height: maskRaw.height, channels: maskChannels },
    })
      .resize(src.width, src.height, { fit: "fill", kernel: "nearest" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    maskScaled = resized.data;
  }
  const mask = new Uint8Array(src.width * src.height);
  const step = maskScaled.length / (src.width * src.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = (maskScaled[Math.floor(i * step)] ?? 0) > 128 ? 1 : 0;
  }
  const bbox = bboxOfMask(mask, src.width, src.height);

  const padX = Math.max(2, Math.round(bbox.width * 0.02));
  const padY = Math.max(2, Math.round(bbox.height * 0.02));
  const cropX0 = Math.max(0, bbox.x - padX);
  const cropY0 = Math.max(0, bbox.y - padY);
  const cropX1 = Math.min(src.width, bbox.x + bbox.width + padX);
  const cropY1 = Math.min(src.height, bbox.y + bbox.height + padY);
  const cropW = cropX1 - cropX0;
  const cropH = cropY1 - cropY0;

  const bboxArea = bbox.width * bbox.height;
  let scale = Math.sqrt((target.targetFill * target.width * target.height) / bboxArea);
  scale = Math.min(scale, (target.width / cropW) * 0.98, (target.height / cropH) * 0.98);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Не посчитать масштаб товара: странная геометрия маски.");
  }
  const outCropW = Math.max(1, Math.round(cropW * scale));
  const outCropH = Math.max(1, Math.round(cropH * scale));
  const outBboxW = Math.max(1, Math.round(bbox.width * scale));
  const outBboxH = Math.max(1, Math.round(bbox.height * scale));

  const region = await sharp(sourcePath)
    .extract({ left: cropX0, top: cropY0, width: cropW, height: cropH })
    .resize(outCropW, outCropH, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const regionChannels = region.info.channels;

  const canvas = Buffer.alloc(target.width * target.height * 3, 255);
  const offX = Math.round((target.width - outCropW) / 2);
  const offY = Math.round((target.height - outCropH) / 2);
  for (let y = 0; y < outCropH; y += 1) {
    const cy = offY + y;
    if (cy < 0 || cy >= target.height) continue;
    for (let x = 0; x < outCropW; x += 1) {
      const cx = offX + x;
      if (cx < 0 || cx >= target.width) continue;
      const si = (y * outCropW + x) * regionChannels;
      const di = (cy * target.width + cx) * 3;
      canvas[di] = region.data[si] ?? 255;
      canvas[di + 1] = region.data[si + 1] ?? 255;
      canvas[di + 2] = region.data[si + 2] ?? 255;
    }
  }
  // Маска в координатах итогового кадра — для whitebg и проверок.
  // Инверсный маппинг: каждый пиксель региона сэмплирует маску исходника.
  // Прямой маппинг с floor оставлял бы дыры при scale != 1, и fixer заливал
  // бы их белым внутри товара (ложное «край съеден» + откат).
  const maskCanvas = Buffer.alloc(target.width * target.height, 0);
  const scaleX = outCropW / cropW;
  const scaleY = outCropH / cropH;
  for (let ry = 0; ry < outCropH; ry += 1) {
    const cy = offY + ry;
    if (cy < 0 || cy >= target.height) continue;
    const srcY = Math.min(src.height - 1, Math.max(0, Math.round(cropY0 + ry / scaleY)));
    for (let rx = 0; rx < outCropW; rx += 1) {
      const cx = offX + rx;
      if (cx < 0 || cx >= target.width) continue;
      const srcX = Math.min(src.width - 1, Math.max(0, Math.round(cropX0 + rx / scaleX)));
      if ((mask[srcY * src.width + srcX] ?? 0) === 1) {
        maskCanvas[cy * target.width + cx] = 255;
      }
    }
  }

  const { mainPath, maskPath: outMaskPath } = outputPathsFor(sourcePath);
  await sharp(canvas, { raw: { width: target.width, height: target.height, channels: 3 } })
    .jpeg({ quality: COMPOSE_JPEG_QUALITY })
    .toFile(mainPath);
  await sharp(maskCanvas, { raw: { width: target.width, height: target.height, channels: 1 } })
    .png()
    .toFile(outMaskPath);

  const fill = Math.min(1, (outBboxW * outBboxH) / (target.width * target.height));
  return composeResultSchema.parse({
    outPath: mainPath,
    maskPath: outMaskPath,
    width: target.width,
    height: target.height,
    fill,
    targetFill: target.targetFill,
    modelUsed: false,
  });
}
