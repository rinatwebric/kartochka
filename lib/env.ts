import { z } from "zod";

const envSchema = z.object({
  MODEL_API_KEY: z.string().optional(),
  META_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MOCK: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse(process.env);
}

export function isMockEnv(env: AppEnv): boolean {
  return env.MOCK === "1" || env.MODEL_API_KEY === undefined;
}
