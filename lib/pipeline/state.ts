import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  jobStateSchema,
  type JobState,
  type JobStep,
  type Marketplace,
} from "./types";

// Состояние джоб: Map в памяти + /tmp/jobs/<id>/job.json. Рестарт не переживает —
// осознанно (см. MASTER.md 5 и DECISIONS.md). На win32 tmpdir ведёт в системный
// temp, что допустимо для локального прогона и Vercel (там /tmp).
export const JOBS_DIR = join(tmpdir(), "jobs");

const jobsCache = new Map<string, JobState>();

export type StepErrorStatus = 404 | 409 | 500;

export class StepError extends Error {
  readonly status: StepErrorStatus;
  readonly missing: string[];

  constructor(status: StepErrorStatus, message: string, missing: string[] = []) {
    super(message);
    this.name = "StepError";
    this.status = status;
    this.missing = missing;
  }
}

export function jobDir(jobId: string): string {
  return join(JOBS_DIR, jobId);
}

export function jobFilePath(jobId: string): string {
  return join(jobDir(jobId), "job.json");
}

export function stepFilePath(jobId: string, step: JobStep): string {
  return join(jobDir(jobId), `${step}.json`);
}

function blankJob(id: string, marketplace: Marketplace, source: string): JobState {
  return jobStateSchema.parse({
    id,
    marketplace,
    status: "queued",
    step: "inspect",
    attempts: { compose: 0, identity: 0 },
    metrics: {
      identity: 0,
      compliance: 0,
      retries: 0,
      productFill: 0,
      score: 0,
      credits: 0,
      ms: 0,
    },
    checklist: [],
    copy: { title: "", description: "", specs: {} },
    assets: { source },
    promptIds: { compose: "compose-v1", identity: "identity-v1", copy: "copy-v1" },
    error: null,
  });
}

export async function createJob(marketplace: Marketplace, source: string): Promise<JobState> {
  const job = blankJob(randomUUID(), marketplace, source);
  await saveJob(job);
  return job;
}

export async function saveJob(job: JobState): Promise<void> {
  const parsed = jobStateSchema.parse(job);
  jobsCache.set(parsed.id, parsed);
  await mkdir(jobDir(parsed.id), { recursive: true });
  await writeFile(jobFilePath(parsed.id), JSON.stringify(parsed, null, 2), "utf-8");
}

export async function loadJob(jobId: string): Promise<JobState> {
  const cached = jobsCache.get(jobId);
  if (cached !== undefined) return cached;
  let text: string;
  try {
    text = await readFile(jobFilePath(jobId), "utf-8");
  } catch {
    throw new StepError(404, `Джоба ${jobId} не найдена. Создайте новую через POST /api/jobs.`);
  }
  const parsed = jobStateSchema.safeParse(JSON.parse(text) as unknown);
  if (!parsed.success) {
    throw new StepError(500, `Состояние джобы ${jobId} повреждено — создайте джобу заново.`);
  }
  jobsCache.set(jobId, parsed.data);
  return parsed.data;
}

export async function readStepResult<T>(jobId: string, step: JobStep): Promise<T | null> {
  try {
    const text = await readFile(stepFilePath(jobId, step), "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeStepResult(jobId: string, step: JobStep, result: unknown): Promise<void> {
  await mkdir(jobDir(jobId), { recursive: true });
  await writeFile(stepFilePath(jobId, step), JSON.stringify(result, null, 2), "utf-8");
}
