import type { ImageResult, SamResult, TextVerdict } from "../models/types";

// Детерминированные фикстуры mock-режима: одинаковый ответ на каждый вызов.
// 1x1 белый PNG — валидный base64, достаточный для проверки plumbing в T2.
const TINY_WHITE_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const mockMask: ImageResult = { b64: TINY_WHITE_PNG_B64 };

export const mockImage: ImageResult = { b64: TINY_WHITE_PNG_B64 };

export const mockSam: SamResult = {
  raw: "mock sam-3.1: 1 match, box(0.25,0.15,0.50,0.70)",
  boxes: [{ x: 0.25, y: 0.15, width: 0.5, height: 0.7 }],
  mask: mockMask,
};

export const mockText: string = "Белая кружка 300 мл: лаконичная карточка для маркетплейса.";

export const mockVerdict: TextVerdict = {
  same: true,
  reason: "mock: силуэт, логотип и пропорции совпадают с исходником",
};

export const mockFixtures = {
  mask: mockMask,
  image: mockImage,
  sam: mockSam,
  text: mockText,
  verdict: mockVerdict,
} as const;
