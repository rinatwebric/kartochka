// pHash через DCT 32x32 -> 8x8 (классический perceptual hash).
// Почему так: MASTER.md 8 требует (1 - hamming(pHash до, pHash после)).
// DCT-II ортонормированная, берём левый верхний угол 8x8 низких частот,
// медиана по 63 AC-коэффициентам (DC исключён — он про яркость, а не структуру),
// бит = 1 если коэффициент выше медианы. Упаковка в bigint (64 бита).

import sharp from "sharp";

export type PHash = bigint;

const PHASH_SIZE = 32;
const PHASH_LOW = 8;

function cosTable(n: number): number[][] {
  const table: number[][] = [];
  for (let x = 0; x < n; x += 1) {
    const row: number[] = [];
    for (let u = 0; u < n; u += 1) {
      row.push(Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n)));
    }
    table.push(row);
  }
  return table;
}

const COS32 = cosTable(PHASH_SIZE);

function normFactor(u: number): number {
  return u === 0 ? Math.sqrt(1 / PHASH_SIZE) : Math.sqrt(2 / PHASH_SIZE);
}

// Чистая функция: DCT-II 32x32 из серых пикселей 0..255.
export function dct32(gray: Uint8Array | Buffer): number[][] {
  if (gray.length < PHASH_SIZE * PHASH_SIZE) {
    throw new Error(`pHash: ожидалось ${PHASH_SIZE * PHASH_SIZE} пикселей, пришло ${gray.length}.`);
  }
  const out: number[][] = [];
  for (let v = 0; v < PHASH_SIZE; v += 1) {
    const row: number[] = [];
    const cv = normFactor(v);
    for (let u = 0; u < PHASH_SIZE; u += 1) {
      const cu = normFactor(u);
      let sum = 0;
      for (let y = 0; y < PHASH_SIZE; y += 1) {
        const cosY = COS32[y]?.[v] ?? 0;
        for (let x = 0; x < PHASH_SIZE; x += 1) {
          const cosX = COS32[x]?.[u] ?? 0;
          sum += (gray[y * PHASH_SIZE + x] ?? 0) * cosX * cosY;
        }
      }
      row.push(sum * cu * cv);
    }
    out.push(row);
  }
  return out;
}

// Чистая функция: 64 бита из DCT-матрицы (медиана по 63 AC).
export function phashFromDct(dct: number[][]): PHash {
  const coeffs: number[] = [];
  for (let y = 0; y < PHASH_LOW; y += 1) {
    for (let x = 0; x < PHASH_LOW; x += 1) {
      if (x === 0 && y === 0) continue;
      coeffs.push(dct[y]?.[x] ?? 0);
    }
  }
  const sorted = [...coeffs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let hash = BigInt(0);
  for (let y = 0; y < PHASH_LOW; y += 1) {
    for (let x = 0; x < PHASH_LOW; x += 1) {
      const v = dct[y]?.[x] ?? 0;
      hash = (hash << BigInt(1)) | (v > median ? BigInt(1) : BigInt(0));
    }
  }
  return hash;
}

export function phashToHex(hash: PHash): string {
  return hash.toString(16).padStart(16, "0");
}

export function phashFromHex(hex: string): PHash {
  const clean = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,16}$/.test(clean)) {
    throw new Error(`pHash: странный hex «${hex}». Ожидалось до 16 hex-цифр.`);
  }
  return BigInt(`0x${clean}`);
}

// Число различающихся бит 0..64.
export function hammingBits(a: PHash, b: PHash): number {
  let x = a ^ b;
  let count = 0;
  for (let i = 0; i < 64; i += 1) {
    if ((x & BigInt(1)) === BigInt(1)) count += 1;
    x >>= BigInt(1);
  }
  return count;
}

// Нормализованное расстояние 0..1.
export function hammingNormalized(a: PHash, b: PHash): number {
  return hammingBits(a, b) / 64;
}

// Похожесть 0..1 — именно она входит в формулу identity с весом 0.35.
export function phashSimilarity(a: PHash, b: PHash): number {
  return 1 - hammingNormalized(a, b);
}

async function gray32FromInput(input: string | Buffer): Promise<Buffer> {
  const pipeline = typeof input === "string" ? sharp(input) : sharp(input);
  const { data } = await pipeline
    .resize(PHASH_SIZE, PHASH_SIZE, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function computePHash(imagePath: string): Promise<PHash> {
  const gray = await gray32FromInput(imagePath);
  return phashFromDct(dct32(gray));
}

export async function computePHashFromBuffer(imageBuffer: Buffer): Promise<PHash> {
  const gray = await gray32FromInput(imageBuffer);
  return phashFromDct(dct32(gray));
}

// Совместимость со стабом T4: hex-строка хеша.
export async function phash(imagePath: string): Promise<string> {
  return phashToHex(await computePHash(imagePath));
}
