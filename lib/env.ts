import { z } from "zod";

const rawEnvSchema = z.object({
  MODEL_API_KEY: z.string().optional(),
  META_BASE_URL: z.string().optional(),
  MOCK: z.string().optional(),
});

export type AppEnv = {
  MODEL_API_KEY: string | undefined;
  META_BASE_URL: string;
  MOCK: "0" | "1";
};

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function loadEnv(): AppEnv {
  const raw = rawEnvSchema.parse(process.env);
  const apiKey = clean(raw.MODEL_API_KEY);
  const baseUrlRaw = clean(raw.META_BASE_URL);
  const baseUrl =
    baseUrlRaw !== undefined ? z.string().url().parse(baseUrlRaw) : "https://api.meta.ai/v1";
  const mockRaw = clean(raw.MOCK);
  const mock: "0" | "1" = mockRaw === "0" ? "0" : "1";
  // Без ключа живой режим невозможен — принудительно включаем MOCK.
  if (apiKey === undefined) {
    return { MODEL_API_KEY: undefined, META_BASE_URL: baseUrl, MOCK: "1" };
  }
  return { MODEL_API_KEY: apiKey, META_BASE_URL: baseUrl, MOCK: mock };
}

export const env: AppEnv = loadEnv();

export function getEnv(): AppEnv {
  return env;
}

export function isMockEnv(e: AppEnv = env): boolean {
  return e.MOCK === "1" || e.MODEL_API_KEY === undefined;
}

export function isMock(): boolean {
  return isMockEnv(env);
}
