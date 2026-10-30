import { getCreditsTotal } from "../models/meta";
import { composeCard } from "./compose";
import { inspectImage } from "./inspect";
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

// Оркестратор шагов T3: inspect -> segment -> compose -> whitebg.
// Идемпотентность: повторный вызов перезаписывает результат шага и поля джобы.
// Возобновление: шаг требует готовый результат предыдущего, иначе 409 со списком.
const T3_STEPS: JobStep[] = ["inspect", "segment", "compose", "whitebg"];

function requireLaterStep(step: JobStep): never {
  throw new StepError(
    409,
    `Шаг «${step}» относится к следующим задачам (T4+) и пока не реализован. Доступны: inspect, segment, compose, whitebg.`,
    [],
  );
}

export async function runStep(job: JobState, step: JobStep): Promise<JobState> {
  if (!T3_STEPS.includes(step)) requireLaterStep(step);
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
  current.status = step === "whitebg" ? "done" : "running";
  current.metrics.ms += Date.now() - started;
  current.metrics.credits += creditsAfter - creditsBefore;
  current.error = null;
  await saveJob(current);
  return current;
}
