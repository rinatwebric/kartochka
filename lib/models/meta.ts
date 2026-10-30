import { env } from "../env";

export const META_TIMEOUT_MS = 60_000;
export const META_MAX_RETRIES = 2;
export const META_RETRY_BASE_DELAY_MS = 500;

// Простая оценка стоимости вызова в условных кредитах (см. MASTER.md раздел 6:
// contributor дешевле, image дороже, glimmer локальный и бесплатный).
export const MODEL_CREDIT_COST: Record<string, number> = {
  "sam-3.1": 1,
  "muse-image-1.0": 5,
  "muse-spark-1.3": 1,
  "muse-spark-1.3-contributor": 0.5,
  "muse-glimmer": 0,
};

let creditsTotal = 0;

export function getCreditsTotal(): number {
  return creditsTotal;
}

export function resetCreditsTotal(): void {
  creditsTotal = 0;
}

export function creditsForModel(model: string): number {
  return MODEL_CREDIT_COST[model] ?? 1;
}

export type ModelErrorCode =
  | "timeout"
  | "rate_limited"
  | "server_error"
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "network_error";

export class ModelError extends Error {
  readonly code: ModelErrorCode;
  readonly status: number;
  readonly model: string;
  readonly retryable: boolean;

  constructor(args: {
    code: ModelErrorCode;
    status: number;
    model: string;
    message: string;
    retryable: boolean;
  }) {
    super(args.message);
    this.name = "ModelError";
    this.code = args.code;
    this.status = args.status;
    this.model = args.model;
    this.retryable = args.retryable;
  }
}

export interface CallMetaOptions {
  model: string;
  path: string;
  body: unknown;
  timeoutMs?: number;
}

export interface MetaCallResult<T> {
  data: T;
  ms: number;
  credits: number;
  status: number;
  model: string;
}

export function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanMessage(status: number, model: string, detail: string): string {
  if (status === 0) return `Модель ${model} недоступна: ${detail}`;
  if (status === 401 || status === 403)
    return `Нет доступа к модели ${model}: проверьте MODEL_API_KEY.`;
  if (status === 429) return `Модель ${model} перегружена (429): повторите через минуту.`;
  if (status >= 500) return `Сервер модели ${model} ошибся (${status}): попробуйте ещё раз.`;
  return `Модель ${model} отклонила запрос (${status}): ${detail}`;
}

function errorCodeFor(status: number, timedOut: boolean): ModelErrorCode {
  if (timedOut) return "timeout";
  if (status === 0) return "network_error";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status >= 500) return "server_error";
  return "bad_request";
}

function logCall(model: string, ms: number, credits: number, status: number): void {
  // Формат лога зафиксирован в AGENTS.md: одна строка на вызов.
  console.log(`[model] name=${model} ms=${ms} credits=${credits} status=${status}`);
}

// Единый fetch-клиент Meta Model API: таймаут 60 с, 2 ретрая на 429/5xx, на 4xx не ретраит.
export async function callMeta<T>(opts: CallMetaOptions): Promise<MetaCallResult<T>> {
  const timeoutMs = opts.timeoutMs ?? META_TIMEOUT_MS;
  const baseUrl = env.META_BASE_URL.replace(/\/$/, "");
  const url = `${baseUrl}${opts.path}`;
  const credits = creditsForModel(opts.model);
  let attempt = 0;
  let lastError: ModelError | null = null;

  while (attempt <= META_MAX_RETRIES) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MODEL_API_KEY ?? ""}`,
        },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });
      const ms = Date.now() - started;
      if (res.ok) {
        const data = (await res.json()) as T;
        creditsTotal += credits;
        logCall(opts.model, ms, credits, res.status);
        return { data, ms, credits, status: res.status, model: opts.model };
      }
      let detail = res.statusText;
      try {
        const errJson = (await res.json()) as {
          error?: { message?: string };
          message?: string;
        };
        detail = errJson.error?.message ?? errJson.message ?? detail;
      } catch {
        // Тело ошибки не JSON — оставляем statusText.
      }
      if (shouldRetry(res.status) && attempt < META_MAX_RETRIES) {
        logCall(opts.model, ms, 0, res.status);
        lastError = new ModelError({
          code: errorCodeFor(res.status, false),
          status: res.status,
          model: opts.model,
          message: humanMessage(res.status, opts.model, detail),
          retryable: true,
        });
        await delay(META_RETRY_BASE_DELAY_MS * 2 ** attempt);
        attempt += 1;
        continue;
      }
      creditsTotal += 0;
      logCall(opts.model, ms, 0, res.status);
      throw new ModelError({
        code: errorCodeFor(res.status, false),
        status: res.status,
        model: opts.model,
        message: humanMessage(res.status, opts.model, detail),
        retryable: false,
      });
    } catch (err) {
      const ms = Date.now() - started;
      if (err instanceof ModelError) {
        if (err.retryable && attempt < META_MAX_RETRIES) {
          await delay(META_RETRY_BASE_DELAY_MS * 2 ** attempt);
          attempt += 1;
          lastError = err;
          continue;
        }
        throw err;
      }
      const aborted =
        err instanceof DOMException && err.name === "AbortError"
          ? true
          : err instanceof Error && err.name === "AbortError";
      const detail = err instanceof Error ? err.message : "неизвестная ошибка сети";
      if (attempt < META_MAX_RETRIES) {
        logCall(opts.model, ms, 0, 0);
        lastError = new ModelError({
          code: errorCodeFor(0, aborted),
          status: 0,
          model: opts.model,
          message: humanMessage(0, opts.model, aborted ? "превышен таймаут 60 с" : detail),
          retryable: true,
        });
        await delay(META_RETRY_BASE_DELAY_MS * 2 ** attempt);
        attempt += 1;
        continue;
      }
      logCall(opts.model, ms, 0, 0);
      throw new ModelError({
        code: errorCodeFor(0, aborted),
        status: 0,
        model: opts.model,
        message: humanMessage(0, opts.model, aborted ? "превышен таймаут 60 с" : detail),
        retryable: false,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  // Недостижимо без нарушения счётчика попыток, но TypeScript требует возврата.
  throw (
    lastError ??
    new ModelError({
      code: "network_error",
      status: 0,
      model: opts.model,
      message: humanMessage(0, opts.model, "исчерпаны ретраи"),
      retryable: false,
    })
  );
}
