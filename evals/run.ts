// Eval-стенд T8: прогоняет evals/cases.json через пайплайн (inspect→…→copy)
// и пишет отчёт в evals/report/<дата>-<режим>-<версия>.json и .csv.
// Запуск: pnpm evals --mock | pnpm evals --live [--version v1|v2]
//        pnpm evals --mock --compare v1 v2
// --live тратит кредиты и требует MODEL_API_KEY; без ключа работает только --mock.
// --compare выполняет два прогона (по одному на версию промптов) и печатает
// разницу по среднему score и по доле прошедших.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { parsePromptVersion, type PromptVersionId } from "../lib/prompts/registry";
import type { JobState, JobStep } from "../lib/pipeline/types";

const evalCaseSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  marketplace: z.enum(["wb", "ozon", "amazon"]),
  expect: z.enum(["pass", "fail"]),
  note: z.string().min(1),
});

type EvalCase = z.infer<typeof evalCaseSchema>;

type EvalMode = "mock" | "live";

interface EvalCli {
  mode: EvalMode;
  modeDefaulted: boolean;
  version: PromptVersionId | null;
  compare: { a: PromptVersionId; b: PromptVersionId } | null;
}

const STEPS: JobStep[] = [
  "inspect",
  "segment",
  "compose",
  "whitebg",
  "identity",
  "rules",
  "copy",
];

function usage(): string {
  return [
    "Использование:",
    "  pnpm evals --mock [--version v1|v2]",
    "  pnpm evals --live [--version v1|v2]",
    "  pnpm evals --mock --compare v1 v2",
  ].join("\n");
}

function parseArgs(argv: string[]): EvalCli {
  let mode: EvalMode | null = null;
  let version: PromptVersionId | null = null;
  let compare: { a: PromptVersionId; b: PromptVersionId } | null = null;
  const errors: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg: string = argv[i] ?? "";
    if (arg === "--mock" || arg === "--live") {
      mode = arg.slice(2) as EvalMode;
      i += 1;
      continue;
    }
    if (arg === "--version") {
      const v = parsePromptVersion(argv[i + 1]);
      if (v === null) errors.push(`--version ждёт v1 или v2, а не «${argv[i + 1] ?? ""}».`);
      else version = v;
      i += 2;
      continue;
    }
    if (arg.startsWith("--version=")) {
      const v = parsePromptVersion(arg.slice("--version=".length));
      if (v === null) errors.push(`--version ждёт v1 или v2, а не «${arg}».`);
      else version = v;
      i += 1;
      continue;
    }
    if (arg === "--compare") {
      const a = parsePromptVersion(argv[i + 1]);
      const b = parsePromptVersion(argv[i + 2]);
      if (a === null || b === null) {
        errors.push("флаг --compare ждёт две версии: --compare v1 v2.");
      } else {
        compare = { a, b };
      }
      i += 3;
      continue;
    }
    if (arg.startsWith("--compare=")) {
      const parts = arg.slice("--compare=".length).split(",");
      const a = parsePromptVersion(parts[0]);
      const b = parsePromptVersion(parts[1]);
      if (a === null || b === null) {
        errors.push("флаг --compare ждёт две версии: --compare v1 v2.");
      } else {
        compare = { a, b };
      }
      i += 1;
      continue;
    }
    errors.push(`неизвестный флаг «${arg}».`);
    i += 1;
  }
  if (errors.length > 0) throw new Error(`${errors.join(" ")}\n${usage()}`);
  return { mode: mode ?? "mock", modeDefaulted: mode === null, version, compare };
}

interface CaseReport {
  id: string;
  file: string;
  marketplace: string;
  expect: "pass" | "fail";
  predicted: "pass" | "fail";
  match: boolean;
  score: number;
  compliance: number;
  identity: number;
  credits: number;
  ms: number;
  promptVersion: PromptVersionId;
  promptIds: { compose: string; identity: string; copy: string };
  failedChecks: string[];
  error: string | null;
}

interface EvalSummary {
  total: number;
  predictedPass: number;
  matchCount: number;
  mismatchCount: number;
  passRate: number;
  avgScore: number;
  avgCredits: number;
  worstCaseId: string;
  worstScore: number;
}

interface EvalReport {
  tool: string;
  generatedAt: string;
  mode: EvalMode;
  promptVersion: PromptVersionId;
  summary: EvalSummary;
  cases: CaseReport[];
}

function summarize(cases: CaseReport[]): EvalSummary {
  let predictedPass = 0;
  let matchCount = 0;
  let scoreSum = 0;
  let creditsSum = 0;
  let worstCaseId = "";
  let worstScore = 101;
  for (const c of cases) {
    if (c.predicted === "pass") predictedPass += 1;
    if (c.match) matchCount += 1;
    scoreSum += c.score;
    creditsSum += c.credits;
    if (c.score < worstScore) {
      worstScore = c.score;
      worstCaseId = c.id;
    }
  }
  const total = cases.length;
  return {
    total,
    predictedPass,
    matchCount,
    mismatchCount: total - matchCount,
    passRate: total === 0 ? 0 : predictedPass / total,
    avgScore: total === 0 ? 0 : scoreSum / total,
    avgCredits: total === 0 ? 0 : creditsSum / total,
    worstCaseId,
    worstScore: total === 0 ? 0 : worstScore,
  };
}

function stamp(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(report: EvalReport): string {
  const header = [
    "id",
    "file",
    "marketplace",
    "expect",
    "predicted",
    "match",
    "score",
    "compliance",
    "identity",
    "credits",
    "ms",
    "promptVersion",
    "composeId",
    "identityId",
    "copyId",
    "failedChecks",
    "error",
  ];
  const lines: string[] = [header.join(",")];
  for (const c of report.cases) {
    lines.push(
      [
        csvCell(c.id),
        csvCell(c.file),
        csvCell(c.marketplace),
        csvCell(c.expect),
        csvCell(c.predicted),
        csvCell(c.match ? "1" : "0"),
        csvCell(c.score),
        csvCell(c.compliance.toFixed(3)),
        csvCell(c.identity.toFixed(3)),
        csvCell(c.credits),
        csvCell(c.ms),
        csvCell(c.promptVersion),
        csvCell(c.promptIds.compose),
        csvCell(c.promptIds.identity),
        csvCell(c.promptIds.copy),
        csvCell(c.failedChecks.join(";")),
        csvCell(c.error ?? ""),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "неизвестная ошибка прогона";
}

async function runOneCase(
  deps: {
    createJob: (marketplace: EvalCase["marketplace"], source: string) => Promise<JobState>;
    runStep: (job: JobState, step: JobStep) => Promise<JobState>;
    resetCreditsTotal: () => void;
    getCreditsTotal: () => number;
  },
  evalCase: EvalCase,
  workDir: string,
  promptVersion: PromptVersionId,
): Promise<CaseReport> {
  const started = Date.now();
  const fail = (error: string, score: number, extra?: Partial<CaseReport>): CaseReport => ({
    id: evalCase.id,
    file: evalCase.file,
    marketplace: evalCase.marketplace,
    expect: evalCase.expect,
    predicted: "fail",
    match: evalCase.expect === "fail",
    score,
    compliance: 0,
    identity: 0,
    credits: deps.getCreditsTotal(),
    ms: Date.now() - started,
    promptVersion,
    promptIds: { compose: "", identity: "", copy: "" },
    failedChecks: [],
    error,
    ...extra,
  });
  let workFile: string;
  try {
    workFile = join(workDir, `${evalCase.id}.jpg`);
    await copyFile(resolve(process.cwd(), evalCase.file), workFile);
  } catch (err) {
    return fail(`нет исходного файла «${evalCase.file}»: ${errorMessage(err)}`, 0);
  }
  try {
    deps.resetCreditsTotal();
    let job = await deps.createJob(evalCase.marketplace, workFile);
    for (const step of STEPS) job = await deps.runStep(job, step);
    const failedChecks = job.checklist.filter((c) => !c.ok).map((c) => c.id);
    const predicted: "pass" | "fail" =
      job.status === "done" && failedChecks.length === 0 ? "pass" : "fail";
    return {
      id: evalCase.id,
      file: evalCase.file,
      marketplace: evalCase.marketplace,
      expect: evalCase.expect,
      predicted,
      match: predicted === evalCase.expect,
      score: job.metrics.score,
      compliance: job.metrics.compliance,
      identity: job.metrics.identity,
      credits: deps.getCreditsTotal(),
      ms: Date.now() - started,
      promptVersion,
      promptIds: { ...job.promptIds },
      failedChecks,
      error: job.status === "done" ? null : (job.error ?? "шаг упал без текста ошибки"),
    };
  } catch (err) {
    return fail(errorMessage(err), 0);
  }
}

async function runSuite(
  cases: EvalCase[],
  mode: EvalMode,
  promptVersion: PromptVersionId,
): Promise<EvalReport> {
  const { createJob } = await import("../lib/pipeline/state");
  const { runStep } = await import("../lib/pipeline/runner");
  const { getCreditsTotal, resetCreditsTotal } = await import("../lib/models/meta");
  const runId = `${stamp(new Date())}-${mode}-${promptVersion}`;
  const workDir = join(tmpdir(), "kartochka-evals", runId);
  await mkdir(workDir, { recursive: true });
  const deps = { createJob, runStep, resetCreditsTotal, getCreditsTotal };
  const results: CaseReport[] = [];
  for (const evalCase of cases) {
    const report = await runOneCase(deps, evalCase, workDir, promptVersion);
    results.push(report);
    const flag = report.match ? "OK  " : "DIFF";
    console.log(
      `[evals] ${flag} ${report.id} ${report.marketplace} expect=${report.expect} predicted=${report.predicted} ` +
        `score=${report.score} credits=${report.credits} ms=${report.ms}`,
    );
  }
  const summary = summarize(results);
  return {
    tool: "kartochka-evals",
    generatedAt: new Date().toISOString(),
    mode,
    promptVersion,
    summary,
    cases: results,
  };
}

async function writeReport(report: EvalReport): Promise<{ jsonPath: string; csvPath: string }> {
  const dir = join(process.cwd(), "evals", "report");
  await mkdir(dir, { recursive: true });
  const base = `${stamp(new Date(report.generatedAt))}-${report.mode}-${report.promptVersion}`;
  const jsonPath = join(dir, `${base}.json`);
  const csvPath = join(dir, `${base}.csv`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  await writeFile(csvPath, toCsv(report), "utf-8");
  return { jsonPath, csvPath };
}

function printSummary(report: EvalReport): void {
  const s = report.summary;
  console.log(
    `[evals] mode=${report.mode} version=${report.promptVersion} cases=${s.total}`,
  );
  console.log(
    `[evals] прошло: ${s.predictedPass}/${s.total} (${(s.passRate * 100).toFixed(1)}%), ` +
      `совпало с expect: ${s.matchCount}/${s.total}`,
  );
  console.log(
    `[evals] средний score: ${s.avgScore.toFixed(1)}, средняя стоимость: ${s.avgCredits.toFixed(2)} кредитов`,
  );
  console.log(`[evals] худший кейс: ${s.worstCaseId} (score ${s.worstScore})`);
  for (const c of report.cases) {
    if (!c.match) {
      console.log(
        `[evals] DIFF ${c.id}: expect=${c.expect} predicted=${c.predicted} ` +
          `score=${c.score} failed=[${c.failedChecks.join(";")}]${c.error === null ? "" : ` error=${c.error}`}`,
      );
    }
  }
}

function printCompare(a: EvalReport, b: EvalReport): void {
  const sa = a.summary;
  const sb = b.summary;
  const deltaScore = sb.avgScore - sa.avgScore;
  const deltaRate = (sb.passRate - sa.passRate) * 100;
  console.log(`[evals] compare ${a.promptVersion} vs ${b.promptVersion} (${a.mode}):`);
  console.log(
    `[evals] ${a.promptVersion}: pass ${sa.predictedPass}/${sa.total} (${(sa.passRate * 100).toFixed(1)}%), avg score ${sa.avgScore.toFixed(2)}`,
  );
  console.log(
    `[evals] ${b.promptVersion}: pass ${sb.predictedPass}/${sb.total} (${(sb.passRate * 100).toFixed(1)}%), avg score ${sb.avgScore.toFixed(2)}`,
  );
  const sign = (v: number): string => (v >= 0 ? "+" : "");
  console.log(
    `[evals] Δ score (${b.promptVersion}-${a.promptVersion}): ${sign(deltaScore)}${deltaScore.toFixed(2)}, ` +
      `Δ pass-rate: ${sign(deltaRate)}${deltaRate.toFixed(1)} п.п.`,
  );
  const changed: Array<{ before: CaseReport; after: CaseReport }> = [];
  const byIdB = new Map(b.cases.map((c) => [c.id, c]));
  for (const ca of a.cases) {
    const cb = byIdB.get(ca.id);
    if (cb !== undefined && cb.score !== ca.score) changed.push({ before: ca, after: cb });
  }
  console.log(`[evals] изменились: ${changed.length}/${sa.total}`);
  for (const { before, after } of changed) {
    const d = after.score - before.score;
    console.log(`[evals]   ${before.id}: ${before.score} -> ${after.score} (${sign(d)}${d})`);
  }
}

async function loadCases(): Promise<EvalCase[]> {
  const raw = await readFile(join(process.cwd(), "evals", "cases.json"), "utf-8");
  const parsed = z.array(evalCaseSchema).safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    throw new Error("evals/cases.json не прошёл схему (нужны id/file/marketplace/expect/note).");
  }
  if (parsed.data.length === 0) throw new Error("evals/cases.json пуст: стенд нечего прогонять.");
  const ids = new Set(parsed.data.map((c) => c.id));
  if (ids.size !== parsed.data.length) throw new Error("evals/cases.json: id кейсов не уникальны.");
  return parsed.data;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.modeDefaulted) console.log("[evals] режим не указан — беру mock (живой режим только по --live).");
  if (cli.mode === "mock") {
    process.env.MOCK = "1";
  } else {
    process.env.MOCK = "0";
    if ((process.env.MODEL_API_KEY ?? "").trim() === "") {
      throw new Error("живой режим (--live) требует MODEL_API_KEY: без ключа работает только --mock.");
    }
    console.log("[evals] живой режим: каждый кейс тратит кредиты Meta Model API.");
  }
  const cases = await loadCases();
  if (cli.compare !== null) {
    process.env.PROMPT_VERSION = cli.compare.a;
    const first = await runSuite(cases, cli.mode, cli.compare.a);
    const firstPaths = await writeReport(first);
    console.log(`[evals] отчёт ${cli.compare.a}: ${firstPaths.jsonPath} + ${firstPaths.csvPath}`);
    printSummary(first);
    process.env.PROMPT_VERSION = cli.compare.b;
    const second = await runSuite(cases, cli.mode, cli.compare.b);
    const secondPaths = await writeReport(second);
    console.log(`[evals] отчёт ${cli.compare.b}: ${secondPaths.jsonPath} + ${secondPaths.csvPath}`);
    printSummary(second);
    printCompare(first, second);
    return;
  }
  const version: PromptVersionId =
    cli.version ?? parsePromptVersion(process.env.PROMPT_VERSION) ?? "v1";
  process.env.PROMPT_VERSION = version;
  const report = await runSuite(cases, cli.mode, version);
  const paths = await writeReport(report);
  console.log(`[evals] отчёт: ${paths.jsonPath} + ${paths.csvPath}`);
  printSummary(report);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
