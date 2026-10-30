import { isMock } from "../env";
import { creditsForModel } from "../models/meta";
import { mockImage, mockMask, mockSam, mockText, mockVerdict } from "./fixtures";
import type { ImageResult, SamResult, TextVerdict } from "../models/types";

export const MOCK_DELAY_MS_MIN = 300;
export const MOCK_DELAY_MS_MAX = 800;

export function isMockMode(): boolean {
  return isMock();
}

async function mockWait(): Promise<number> {
  const range = MOCK_DELAY_MS_MAX - MOCK_DELAY_MS_MIN;
  const wait = MOCK_DELAY_MS_MIN + Math.floor(Math.random() * (range + 1));
  await new Promise((resolve) => setTimeout(resolve, wait));
  return wait;
}

function logMock(model: string, waitedMs: number): void {
  console.log(
    `[model] name=${model} ms=${waitedMs} credits=${creditsForModel(model)} status=mock`,
  );
}

export async function mockSegment(): Promise<SamResult> {
  const waited = await mockWait();
  logMock("sam-3.1", waited);
  return mockSam;
}

export async function mockGenerate(): Promise<ImageResult> {
  const waited = await mockWait();
  logMock("muse-image-1.0", waited);
  return mockImage;
}

export async function mockAsk(): Promise<string> {
  const waited = await mockWait();
  logMock("muse-spark-1.3", waited);
  return mockText;
}

export async function mockJudge(): Promise<TextVerdict> {
  const waited = await mockWait();
  logMock("muse-glimmer", waited);
  return mockVerdict;
}

export function mockMaskFixture(): ImageResult {
  return mockMask;
}
