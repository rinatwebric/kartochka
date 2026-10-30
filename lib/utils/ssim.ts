// SSIM по области маски: настоящая формула, упрощённый оконный подсчёт.
// SSIM(x,y) = (2*mx*my + C1)*(2*cov + C2) / ((mx^2 + my^2 + C1)*(varx + vary + C2)),
// C1 = (0.01*255)^2, C2 = (0.03*255)^2. Окно 8x8 без перекрытия на кадре 256x256
// (1024 окна, среднее). ssimOnMask считает только окна с покрытием маски > 50%.

import sharp from "sharp";

export const SSIM_SIDE = 256;
export const SSIM_WINDOW = 8;
export const SSIM_C1 = 6.5025;
export const SSIM_C2 = 58.5225;

function ssimOfWindows(
  a: Uint8Array | Buffer,
  b: Uint8Array | Buffer,
  width: number,
  height: number,
  use: boolean[] | null,
): number {
  const w = SSIM_WINDOW;
  let sum = 0;
  let count = 0;
  for (let y0 = 0; y0 + w <= height; y0 += w) {
    for (let x0 = 0; x0 + w <= width; x0 += w) {
      if (use !== null) {
        let inside = 0;
        for (let y = 0; y < w; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (use[(y0 + y) * width + (x0 + x)] === true) inside += 1;
          }
        }
        if (inside < (w * w) / 2) continue;
      }
      let mx = 0;
      let my = 0;
      for (let y = 0; y < w; y += 1) {
        for (let x = 0; x < w; x += 1) {
          mx += a[(y0 + y) * width + (x0 + x)] ?? 0;
          my += b[(y0 + y) * width + (x0 + x)] ?? 0;
        }
      }
      mx /= w * w;
      my /= w * w;
      let varX = 0;
      let varY = 0;
      let cov = 0;
      for (let y = 0; y < w; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const dx = (a[(y0 + y) * width + (x0 + x)] ?? 0) - mx;
          const dy = (b[(y0 + y) * width + (x0 + x)] ?? 0) - my;
          varX += dx * dx;
          varY += dy * dy;
          cov += dx * dy;
        }
      }
      varX /= w * w;
      varY /= w * w;
      cov /= w * w;
      const num = (2 * mx * my + SSIM_C1) * (2 * cov + SSIM_C2);
      const den = (mx * mx + my * my + SSIM_C1) * (varX + varY + SSIM_C2);
      sum += den === 0 ? 1 : num / den;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, Math.min(1, mean));
}

// Чистая функция: SSIM двух серых кадров одинакового размера.
export function ssimBetweenGray(
  a: Uint8Array | Buffer,
  b: Uint8Array | Buffer,
  width: number,
  height: number,
): number {
  if (a.length < width * height || b.length < width * height) {
    throw new Error(`SSIM: буфер меньше ${width}x${height}.`);
  }
  return ssimOfWindows(a, b, width, height, null);
}

async function gray256(input: string | Buffer): Promise<Buffer> {
  const pipeline = typeof input === "string" ? sharp(input) : sharp(input);
  const { data } = await pipeline
    .resize(SSIM_SIDE, SSIM_SIDE, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

export async function ssimBetweenImages(aPath: string, bPath: string): Promise<number> {
  const [ga, gb] = await Promise.all([gray256(aPath), gray256(bPath)]);
  return ssimBetweenGray(ga, gb, SSIM_SIDE, SSIM_SIDE);
}

export async function ssimBetweenBuffers(aBuf: Buffer, bBuf: Buffer): Promise<number> {
  const [ga, gb] = await Promise.all([gray256(aBuf), gray256(bBuf)]);
  return ssimBetweenGray(ga, gb, SSIM_SIDE, SSIM_SIDE);
}

// SSIM только по маске: окна с покрытием < 50% пропускаются.
// Маска приводится к 256x256 ближайшим соседом, порог 128.
export async function ssimOnMask(
  aPath: string,
  bPath: string,
  maskPath: string,
): Promise<number> {
  const [ga, gb] = await Promise.all([gray256(aPath), gray256(bPath)]);
  const { data: maskRaw, info } = await sharp(maskPath)
    .resize(SSIM_SIDE, SSIM_SIDE, { fit: "fill", kernel: "nearest" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const use: boolean[] = new Array<boolean>(SSIM_SIDE * SSIM_SIDE).fill(false);
  const step = maskRaw.length / (info.width * info.height);
  for (let i = 0; i < use.length; i += 1) {
    use[i] = (maskRaw[Math.floor(i * step)] ?? 0) > 128;
  }
  return ssimOfWindows(ga, gb, SSIM_SIDE, SSIM_SIDE, use);
}
