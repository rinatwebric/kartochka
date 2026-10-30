// Identity gate: формула из MASTER.md раздел 8.
// identity = 0.35*(1-hamming) + 0.25*HSV + 0.25*SSIM + 0.15*glimmer, порог 0.90.
// Сравнение — по кропам товара (bbox маски -> квадрат 256): иначе белый фон
// после whitebg ронял бы все гистограммные метрики даже на том же товаре.
// HSV в формуле — max(0, корреляция Пирсона). Glimmer — большинство из 3 голосов.

import sharp from "sharp";
import { z } from "zod";
import { isMock } from "../env";
import { judgeIdentity } from "../models/glimmer";
import { getActivePromptSet } from "../prompts/registry";
import { computePHashFromBuffer, phashSimilarity } from "../utils/phash";
import { histogramCorrelation, hsvHistogramFromBuffer } from "../utils/hsv";
import { ssimBetweenBuffers } from "../utils/ssim";

export const IDENTITY_THRESHOLD = 0.9;
export const IDENTITY_WEIGHTS = { phash: 0.35, hsv: 0.25, ssim: 0.25, glimmer: 0.15 } as const;
export const IDENTITY_PROMPT_ID = "identity-v1";
export const IDENTITY_COMPOSE_ENHANCED_ID = "compose-v2-enhanced";
export const IDENTITY_MAX_RETRIES = 2;
const CROP_SIDE = 256;

export const identityBreakdownSchema = z.object({
  phashBits: z.number().int().min(0).max(64),
  phashSimilarity: z.number().min(0).max(1),
  hsvCorrelation: z.number().min(-1).max(1),
  hsvScore: z.number().min(0).max(1),
  ssim: z.number().min(0).max(1),
  glimmerSame: z.boolean(),
  glimmerVotes: z.number().int().min(0).max(3),
});
export type IdentityBreakdown = z.infer<typeof identityBreakdownSchema>;

export const identityContributionsSchema = z.object({
  phash: z.number().min(0),
  hsv: z.number().min(0),
  ssim: z.number().min(0),
  glimmer: z.number().min(0),
});
export type IdentityContributions = z.infer<typeof identityContributionsSchema>;

export const identityResultSchema = z.object({
  identity: z.number().min(0).max(1),
  passed: z.boolean(),
  breakdown: identityBreakdownSchema,
  contributions: identityContributionsSchema,
  glimmerReason: z.string().min(1),
  promptId: z.string().min(1),
  retries: z.number().int().min(0).max(2),
});
export type IdentityResult = z.infer<typeof identityResultSchema>;

export interface IdentityInputs {
  sourceMaskPath?: string;
  mainMaskPath?: string;
}

function bboxOfMask(mask: Uint8Array, width: number, height: number): { x: number; y: number; w: number; h: number } | null {
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
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Кроп товара в квадрат: bbox маски -> extract -> resize. Без маски — весь кадр.
export async function cropProductSquare(imagePath: string, maskPath?: string): Promise<Buffer> {
  const meta = await sharp(imagePath).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;
  if (imgW <= 0 || imgH <= 0) {
    throw new Error(`Identity: странные размеры кадра ${imagePath}.`);
  }
  if (maskPath === undefined) {
    return sharp(imagePath).resize(CROP_SIDE, CROP_SIDE, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  }
  let maskScaled: Buffer;
  try {
    const { data, info } = await sharp(maskPath).raw().toBuffer({ resolveWithObject: true });
    if (info.width === imgW && info.height === imgH) {
      maskScaled = Buffer.isBuffer(data) ? data : Buffer.from(data);
    } else {
      const ch = info.channels === 1 || info.channels === 2 || info.channels === 3 || info.channels === 4
        ? info.channels
        : 1;
      const resized = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
        .resize(imgW, imgH, { fit: "fill", kernel: "nearest" })
        .raw()
        .toBuffer({ resolveWithObject: false });
      maskScaled = Buffer.isBuffer(resized) ? resized : Buffer.from(resized);
    }
  } catch {
    return sharp(imagePath).resize(CROP_SIDE, CROP_SIDE, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  }
  const mask = new Uint8Array(imgW * imgH);
  const step = maskScaled.length / (imgW * imgH);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = (maskScaled[Math.floor(i * step)] ?? 0) > 128 ? 1 : 0;
  }
  const bbox = bboxOfMask(mask, imgW, imgH);
  if (bbox === null) {
    return sharp(imagePath).resize(CROP_SIDE, CROP_SIDE, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
  }
  // Инсет внутрь bbox на ~3%: rim у main-кадра после whitebg-эрозии белый,
  // у source — цвет товара. Сравниваем интерьер, иначе один и тот же товар
  // терял бы ~0.03 identity только на кромке.
  const inset = Math.max(1, Math.round(Math.min(bbox.w, bbox.h) * 0.03));
  const ix = Math.min(bbox.x + inset, bbox.x + bbox.w - 1);
  const iy = Math.min(bbox.y + inset, bbox.y + bbox.h - 1);
  const iw = Math.max(1, bbox.w - inset * 2);
  const ih = Math.max(1, bbox.h - inset * 2);
  return sharp(imagePath)
    .extract({ left: ix, top: iy, width: Math.min(iw, imgW - ix), height: Math.min(ih, imgH - iy) })
    .resize(CROP_SIDE, CROP_SIDE, { fit: "fill" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

export interface GlimmerMajority {
  same: boolean;
  votes: number;
  reason: string;
}

// Glimmer трижды, побеждает большинство. Тестовый крюк IDENTITY_FORCE_FAIL=1
// заставляет вернуть same=false (петля ретраев проверяется без живой модели).
export async function judgeGlimmerMajority(prompt: string, imageB64?: string): Promise<GlimmerMajority> {
  if (process.env.IDENTITY_FORCE_FAIL === "1") {
    return { same: false, votes: 0, reason: "forced fail for retry-loop test (IDENTITY_FORCE_FAIL=1)" };
  }
  const calls = [0, 1, 2].map(() => judgeIdentity(prompt, imageB64));
  const verdicts = await Promise.all(calls);
  const yes = verdicts.filter((v) => v.same).length;
  const same = yes >= 2;
  const reason = (same
    ? verdicts.find((v) => v.same)?.reason
    : verdicts.find((v) => !v.same)?.reason) ?? (same ? "glimmer: same" : "glimmer: different");
  return { same, votes: yes, reason };
}

async function comparisonMontageB64(sourceCrop: Buffer, mainCrop: Buffer): Promise<string> {
  const half = 512;
  const [left, right] = await Promise.all([
    sharp(sourceCrop).resize(half, half, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true }),
    sharp(mainCrop).resize(half, half, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const canvas = Buffer.alloc(half * 2 * half * 3);
  const copySide = (side: { data: Buffer; info: { channels: number } }, offX: number): void => {
    const ch = side.info.channels;
    for (let y = 0; y < half; y += 1) {
      for (let x = 0; x < half; x += 1) {
        const si = (y * half + x) * ch;
        const di = (y * half * 2 + (offX + x)) * 3;
        canvas[di] = side.data[si] ?? 0;
        canvas[di + 1] = side.data[si + 1] ?? 0;
        canvas[di + 2] = side.data[si + 2] ?? 0;
      }
    }
  };
  copySide(left, 0);
  copySide(right, half);
  const jpg = await sharp(canvas, { raw: { width: half * 2, height: half, channels: 3 } })
    .jpeg({ quality: 88 })
    .toBuffer();
  return jpg.toString("base64");
}

export async function computeIdentity(
  sourcePath: string,
  mainPath: string,
  inputs: IdentityInputs = {},
  retries = 0,
): Promise<IdentityResult> {
  const [sourceCrop, mainCrop] = await Promise.all([
    cropProductSquare(sourcePath, inputs.sourceMaskPath),
    cropProductSquare(mainPath, inputs.mainMaskPath),
  ]);
  const [hashA, hashB] = await Promise.all([
    computePHashFromBuffer(sourceCrop),
    computePHashFromBuffer(mainCrop),
  ]);
  const bits = (() => {
    let x = hashA ^ hashB;
    let c = 0;
    for (let i = 0; i < 64; i += 1) {
      if ((x & BigInt(1)) === BigInt(1)) c += 1;
      x >>= BigInt(1);
    }
    return c;
  })();
  const phashSimilarityScore = phashSimilarity(hashA, hashB);
  const [histA, histB] = await Promise.all([
    hsvHistogramFromBuffer(sourceCrop),
    hsvHistogramFromBuffer(mainCrop),
  ]);
  const hsvCorr = histogramCorrelation(histA, histB);
  const hsvScore = Math.max(0, hsvCorr);
  const ssim = await ssimBetweenBuffers(sourceCrop, mainCrop);
  let glimmerImage: string | undefined;
  if (!isMock()) {
    glimmerImage = await comparisonMontageB64(sourceCrop, mainCrop);
  }
  const glimmer = await judgeGlimmerMajority(
    getActivePromptSet().identityJudgePrompt,
    glimmerImage,
  );
  const contributions: IdentityContributions = {
    phash: IDENTITY_WEIGHTS.phash * phashSimilarityScore,
    hsv: IDENTITY_WEIGHTS.hsv * hsvScore,
    ssim: IDENTITY_WEIGHTS.ssim * ssim,
    glimmer: IDENTITY_WEIGHTS.glimmer * (glimmer.same ? 1 : 0),
  };
  const identity = Math.max(
    0,
    Math.min(1, contributions.phash + contributions.hsv + contributions.ssim + contributions.glimmer),
  );
  return identityResultSchema.parse({
    identity,
    passed: identity >= IDENTITY_THRESHOLD,
    breakdown: {
      phashBits: bits,
      phashSimilarity: phashSimilarityScore,
      hsvCorrelation: hsvCorr,
      hsvScore,
      ssim,
      glimmerSame: glimmer.same,
      glimmerVotes: glimmer.votes,
    },
    contributions,
    glimmerReason: glimmer.reason,
    promptId: getActivePromptSet().identityId,
    retries,
  });
}

// Совместимость: быстрая проверка без масок (целые кадры).
export async function checkIdentity(before: string, after: string): Promise<IdentityResult> {
  return computeIdentity(before, after, {}, 0);
}
