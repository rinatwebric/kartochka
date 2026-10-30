// Реестр версий промптов T8: каждый промпт имеет id, вызовы моделей берут
// текст только отсюда, id пишется в job.json (promptIds) и в отчёт eval-стенда.
// v1 — формулировки T4–T6, v2 — строгие. Активная версия: PROMPT_VERSION=v2
// для A/B (eval --compare переключает её между прогонами), иначе v1.

import { V1_PROMPTS } from "./v1";
import { V2_PROMPTS } from "./v2";

export type PromptVersionId = "v1" | "v2";

export type VisionCheckId = "no_text_on_main" | "no_watermark" | "single_object";

export interface CopyPromptArgs {
  marketplaceName: string;
  category: string;
  titleMax: number;
  descriptionMax: number;
  sentencesMin: number;
  sentencesMax: number;
  specsMin: number;
  specsMax: number;
}

export interface PromptSet {
  id: PromptVersionId;
  composeId: string;
  composeEnhancedId: string;
  identityId: string;
  copyId: string;
  segmentPrompt: (category: string) => string;
  identityJudgePrompt: string;
  buildCopyPrompt: (args: CopyPromptArgs) => string;
  visionPrompt: (checkId: VisionCheckId) => string;
}

const REGISTRY: Record<PromptVersionId, PromptSet> = {
  v1: V1_PROMPTS,
  v2: V2_PROMPTS,
};

export const PROMPT_VERSIONS: PromptVersionId[] = ["v1", "v2"];

export const DEFAULT_PROMPT_VERSION: PromptVersionId = "v1";

export function parsePromptVersion(value: unknown): PromptVersionId | null {
  return value === "v1" || value === "v2" ? value : null;
}

export function getActivePromptVersion(): PromptVersionId {
  return parsePromptVersion(process.env.PROMPT_VERSION) ?? DEFAULT_PROMPT_VERSION;
}

export function getPromptSet(version: PromptVersionId = getActivePromptVersion()): PromptSet {
  return REGISTRY[version];
}

export function getActivePromptSet(): PromptSet {
  return getPromptSet(getActivePromptVersion());
}
