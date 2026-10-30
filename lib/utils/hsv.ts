// Гистограмма HSV и корреляция Пирсона двух гистограмм.
// Почему так: MASTER.md 8 требует корреляцию гистограмм HSV с весом 0.25.
// Сетка H=16, S=4, V=4 (256 бинов): hue различает цвет товара, S/V грубые,
// чтобы тени и JPEG не роняли скор. Нормировка суммой в 1.
// Сравнение — Пирсон (-1..1); в identity отрицательные клампятся в 0.

import sharp from "sharp";

export const HSV_BINS_H = 16;
export const HSV_BINS_S = 4;
export const HSV_BINS_V = 4;
export const HSV_HIST_SIZE = HSV_BINS_H * HSV_BINS_S * HSV_BINS_V;
const HSV_WORK_SIDE = 128;

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

// Чистая функция: RGB 0..255 -> H 0..360, S/V 0..1.
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

// Чистая функция: гистограмма из RGB-пикселей, нормированная суммой в 1.
export function hsvHistogramFromRgb(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  channels: number,
): number[] {
  if (channels < 3) {
    throw new Error(`HSV: нужен RGB-кадр, пришло каналов: ${channels}.`);
  }
  const hist = new Array<number>(HSV_HIST_SIZE).fill(0);
  const total = width * height;
  if (total <= 0) throw new Error("HSV: пустой кадр, считать нечего.");
  for (let p = 0; p < total; p += 1) {
    const r = data[p * channels] ?? 0;
    const g = data[p * channels + 1] ?? 0;
    const b = data[p * channels + 2] ?? 0;
    const { h, s, v } = rgbToHsv(r, g, b);
    const hb = Math.min(HSV_BINS_H - 1, Math.floor(h / (360 / HSV_BINS_H)));
    const sb = Math.min(HSV_BINS_S - 1, Math.floor(s * HSV_BINS_S));
    const vb = Math.min(HSV_BINS_V - 1, Math.floor(v * HSV_BINS_V));
    hist[(hb * HSV_BINS_S + sb) * HSV_BINS_V + vb] =
      (hist[(hb * HSV_BINS_S + sb) * HSV_BINS_V + vb] ?? 0) + 1;
  }
  return hist.map((c) => c / total);
}

async function histogramOfInput(input: string | Buffer): Promise<number[]> {
  const pipeline = typeof input === "string" ? sharp(input) : sharp(input);
  const { data, info } = await pipeline
    .resize(HSV_WORK_SIDE, HSV_WORK_SIDE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return hsvHistogramFromRgb(data, info.width, info.height, info.channels);
}

export async function hsvHistogramFromImage(imagePath: string): Promise<number[]> {
  return histogramOfInput(imagePath);
}

export async function hsvHistogramFromBuffer(imageBuffer: Buffer): Promise<number[]> {
  return histogramOfInput(imageBuffer);
}

// Чистая функция: корреляция Пирсона -1..1. Вырожденный случай (нулевая
// дисперсия): 1 если гистограммы равны, иначе 0.
export function histogramCorrelation(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`HSV: гистограммы разной длины (${a.length} vs ${b.length}).`);
  }
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += a[i] ?? 0;
    meanB += b[i] ?? 0;
  }
  meanA /= n;
  meanB /= n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) {
    for (let i = 0; i < n; i += 1) {
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return 0;
    }
    return 1;
  }
  const corr = num / den;
  if (!Number.isFinite(corr)) return 0;
  return Math.max(-1, Math.min(1, corr));
}

// Совместимость со стабом T4: корреляция целых кадров по путям.
export async function hsvCorrelation(aPath: string, bPath: string): Promise<number> {
  const [ha, hb] = await Promise.all([hsvHistogramFromImage(aPath), hsvHistogramFromImage(bPath)]);
  return histogramCorrelation(ha, hb);
}
