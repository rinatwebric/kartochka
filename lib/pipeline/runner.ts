import { getCreditsTotal } from "../models/meta";
import { getPromptSet } from "../prompts/registry";
import { composeCard } from "./compose";
import { writeCopy } from "./copy";
import { IDENTITY_MAX_RETRIES, computeIdentity } from "./identity";
import { inspectImage } from "./inspect";
import { checkRules } from "./rules";
import { fixWhiteBg } from "./whitebg";
import { segmentProduct } from "./segment";
import {
  loadJob,
  readStepResult,
  saveJob,
  StepError,
  writeStepResult,
} from "./state";
import {
  type ComposeResult,
  type InspectMetrics,
  type JobState,
  type JobStep,
  type SegmentResult,
  type WhitebgResult,
} from "./types";

// Оркестратор шагов T3+T4+T5+T6: inspect -> segment -> compose -> whitebg -> identity -> rules -> copy.
// Идемпотентность: повторный вызов перезаписывает результат шага и поля джобы.
// Возобновление: шаг требует готовый результат предыдущего, иначе 409 со списком.
// Identity: при провале (< 0.90) перегенерирует главный кадр с усиленным
// промптом, максимум 2 ретрая. Compose детерминированный (вариант B), поэтому
// ретрай структурный: пересчёт mask->compose->whitebg->identity, попытка
// засчитывается, promptId фиксирует усиление.
// Export не шаг пайплайна: архив собирает браузер из /api/jobs/{id}/export
// и /api/jobs/{id}/asset/{name} (см. lib/pipeline/export.ts).
const IMPLEMENTED_STEPS: JobStep[] = [
  "inspect",
  "segment",
  "compose",
  "whitebg",
  "identity",
  "rules",
  "copy",
];

function requireLaterStep(step: JobStep): never {
  throw new StepError(
    409,
    `Шаг «${step}» не выполняется на сервере: экспорт собирает браузер из /api/jobs/{id}/export и /api/jobs/{id}/asset/{name}. Доступны шаги: inspect, segment, compose, whitebg, identity, rules, copy.`,
    [],
  );
}

export async function runStep(job: JobState, step: JobStep): Promise<JobState> {
  if (!IMPLEMENTED_STEPS.includes(step)) requireLaterStep(step);
  const current = await loadJob(job.id);
  const started = Date.now();
  const creditsBefore = getCreditsTotal();
  try {
    switch (step) {
      case "inspect": {
        const result: InspectMetrics = await inspectImage(current.assets.source);
        await writeStepResult(current.id, step, result);
        current.metrics.productFill = 0;
        break;
      }
      case "segment": {
        const inspect = await readStepResult<InspectMetrics>(current.id, "inspect");
        if (inspect === null) {
          throw new StepError(409, "Сначала выполните inspect: без метрик кадра нет смысла выделять товар.", ["inspect"]);
        }
        const result: SegmentResult = await segmentProduct(current.assets.source);
        await writeStepResult(current.id, step, result);
        current.metrics.productFill = result.fill;
        break;
      }
      case "compose": {
        const segment = await readStepResult<SegmentResult>(current.id, "segment");
        if (segment === null) {
          throw new StepError(409, "Сначала выполните segment: без маски нечего класть на белый фон.", ["segment"]);
        }
        const result: ComposeResult = await composeCard(
          current.assets.source,
          segment.maskPath,
          current.marketplace,
        );
        await writeStepResult(current.id, step, result);
        current.attempts.compose += 1;
        current.metrics.productFill = result.fill;
        current.assets.main = result.outPath;
        break;
      }
      case "whitebg": {
        const compose = await readStepResult<ComposeResult>(current.id, "compose");
        if (compose === null) {
          throw new StepError(409, "Сначала выполните compose: доводить до белого пока нечего.", ["compose"]);
        }
        const result: WhitebgResult = await fixWhiteBg(compose.outPath, compose.maskPath);
        await writeStepResult(current.id, step, result);
        current.assets.main = result.outPath;
        break;
      }
      case "identity": {
        const compose = await readStepResult<ComposeResult>(current.id, "compose");
        if (compose === null) {
          throw new StepError(409, "Сначала выполните compose: identity нечего проверять.", ["compose"]);
        }
        const whitebg = await readStepResult<WhitebgResult>(current.id, "whitebg");
        if (whitebg === null) {
          throw new StepError(409, "Сначала выполните whitebg: identity проверяет финал.", ["whitebg"]);
        }
        const segment = await readStepResult<SegmentResult>(current.id, "segment");
        if (segment === null) {
          throw new StepError(409, "Сначала выполните segment: без маски identity не посчитать.", ["segment"]);
        }
        let mainPath = whitebg.outPath;
        let mainMaskPath = compose.maskPath;
        let composePromptId = current.promptIds.compose;
        let result = await computeIdentity(
          current.assets.source,
          mainPath,
          { sourceMaskPath: segment.maskPath, mainMaskPath },
          0,
        );
        let retries = 0;
        while (!result.passed && retries < IDENTITY_MAX_RETRIES) {
          retries += 1;
          composePromptId = getPromptSet().composeEnhancedId;
          const recomposed = await composeCard(current.assets.source, segment.maskPath, current.marketplace);
          const rewhite = await fixWhiteBg(recomposed.outPath, recomposed.maskPath);
          await writeStepResult(current.id, "compose", recomposed);
          await writeStepResult(current.id, "whitebg", rewhite);
          current.attempts.compose += 1;
          current.assets.main = rewhite.outPath;
          mainPath = rewhite.outPath;
          mainMaskPath = recomposed.maskPath;
          result = await computeIdentity(
            current.assets.source,
            mainPath,
            { sourceMaskPath: segment.maskPath, mainMaskPath },
            retries,
          );
        }
        current.attempts.identity += retries + 1;
        current.metrics.identity = result.identity;
        current.metrics.retries += retries;
        current.promptIds.compose = composePromptId;
        current.promptIds.identity = getPromptSet().identityId;
        current.assets.main = mainPath;
        await writeStepResult(current.id, step, { ...result, retries, attempts: retries + 1 });
        const measured = `identity ${result.identity.toFixed(3)} (порог 0.90)`;
        const glimmerNote =
          result.breakdown.glimmerAbstained === true
            ? "glimmer abstained (self-host only)"
            : `glimmer ${result.breakdown.glimmerSame ? "same" : "different"} ${result.breakdown.glimmerVotes}/3`;
        const reason =
          `pHash ${result.breakdown.phashSimilarity.toFixed(3)} (биты ${result.breakdown.phashBits}), ` +
          `HSV ${result.breakdown.hsvScore.toFixed(3)}, SSIM ${result.breakdown.ssim.toFixed(3)}, ` +
          glimmerNote;
        current.checklist = [
          ...current.checklist.filter((c) => c.id !== "identity"),
          result.passed
            ? { id: "identity", label: "Товар тот же после обработки", ok: true, measured, weight: 0 }
            : {
                id: "identity",
                label: "Товар тот же после обработки",
                ok: false,
                measured,
                weight: 0,
                fix: "Товар не прошёл identity gate: переснимите или примите другой кадр.",
                reason: `${reason}. Ретраев: ${retries}.`,
              },
        ];
        break;
      }
      case "rules": {
        const result = await checkRules(current.id);
        await writeStepResult(current.id, step, result);
        current.metrics.compliance = result.compliance;
        current.metrics.score = result.score;
        const ruleIds = new Set(result.checklist.map((c) => c.id));
        current.checklist = [
          ...current.checklist.filter((c) => !ruleIds.has(c.id)),
          ...result.checklist,
        ];
        break;
      }
      case "copy": {
        const copy = await writeCopy(current.id);
        await writeStepResult(current.id, step, copy);
        current.copy = copy;
        current.promptIds.copy = getPromptSet().copyId;
        break;
      }
      default:
        requireLaterStep(step);
    }
  } catch (err) {
    const creditsAfter = getCreditsTotal();
    current.metrics.ms += Date.now() - started;
    current.metrics.credits += creditsAfter - creditsBefore;
    current.status = "failed";
    current.step = step;
    current.error =
      err instanceof StepError || err instanceof Error
        ? err.message
        : "Неизвестная ошибка шага. Попробуйте ещё раз.";
    await saveJob(current);
    throw err;
  }
  const creditsAfter = getCreditsTotal();
  current.step = step;
  current.status = step === "whitebg" || step === "identity" || step === "rules" || step === "copy" ? "done" : "running";
  current.metrics.ms += Date.now() - started;
  current.metrics.credits += creditsAfter - creditsBefore;
  current.error = null;
  await saveJob(current);
  return current;
}
