import { stat } from "node:fs/promises";
import sharp from "sharp";
import { readRaw } from "../utils/image";
import { inspectMetricsSchema, type Borders, type InspectMetrics } from "./types";

// Порог предупреждения о мыле: дисперсия лапласиана ниже — кадр, вероятно,
// снят в движении или не в фокусе. Стартовое значение до выборки eval-стенда (T8).
export const SHARPNESS_WARN_BELOW = 20;

// Резкость как дисперсия отклика лапласиана 3x3 по grayscale-кадру.
export async function laplacianVariance(path: string): Promise<number> {
  const { data } = await sharp(path)
    .grayscale()
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = data.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of data) sq += (v - mean) * (v - mean);
  return sq / n;
}

// Касание маски краёв кадра: белый пиксель (>128) в полосе edgePx у каждой стороны.
export async function maskTouchesBorders(
  maskPath: string,
  edgePx = 2,
): Promise<Borders> {
  const raw = await readRaw(maskPath);
  const touches = { left: false, right: false, top: false, bottom: false };
  const edge = Math.max(1, Math.min(edgePx, Math.floor(Math.min(raw.width, raw.height) / 2)));
  const isWhite = (x: number, y: number): boolean => {
    const v = raw.data[(y * raw.width + x) * raw.channels];
    return (v ?? 0) > 128;
  };
  for (let y = 0; y < raw.height && !touches.left; y += 1) {
    for (let e = 0; e < edge; e += 1) {
      if (isWhite(e, y)) {
        touches.left = true;
        break;
      }
    }
  }
  for (let y = 0; y < raw.height && !touches.right; y += 1) {
    for (let e = 0; e < edge; e += 1) {
      if (isWhite(raw.width - 1 - e, y)) {
        touches.right = true;
        break;
      }
    }
  }
  for (let x = 0; x < raw.width && !touches.top; x += 1) {
    for (let e = 0; e < edge; e += 1) {
      if (isWhite(x, e)) {
        touches.top = true;
        break;
      }
    }
  }
  for (let x = 0; x < raw.width && !touches.bottom; x += 1) {
    for (let e = 0; e < edge; e += 1) {
      if (isWhite(x, raw.height - 1 - e)) {
        touches.bottom = true;
        break;
      }
    }
  }
  return touches;
}

// Inspect: размеры, aspect, резкость, касание маски краёв (маска опциональна —
// на этом шаге её может ещё не быть, тогда borders все false).
export async function inspectImage(
  sourcePath: string,
  maskPath?: string,
): Promise<InspectMetrics> {
  let meta;
  try {
    meta = await sharp(sourcePath).metadata();
  } catch {
    throw new Error(`Не удалось прочитать фото: ${sourcePath}. Проверьте, что файл существует.`);
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error(`Фото без размеров: ${sourcePath}. Файл, похоже, повреждён.`);
  }
  const [sharpness, borders, fileStat] = await Promise.all([
    laplacianVariance(sourcePath),
    maskPath !== undefined ? maskTouchesBorders(maskPath) : Promise.resolve<Borders>({ left: false, right: false, top: false, bottom: false }),
    stat(sourcePath),
  ]);
  return inspectMetricsSchema.parse({
    width,
    height,
    aspect: width / height,
    sharpness,
    lowSharpness: sharpness < SHARPNESS_WARN_BELOW,
    borders,
    format: meta.format ?? "unknown",
    bytes: fileStat.size,
  });
}
