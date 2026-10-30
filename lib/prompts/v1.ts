import type { CopyPromptArgs, PromptSet, VisionCheckId } from "./registry";

// v1 — формулировки из T4–T6 без изменений. Точка отсчёта для eval-сравнения:
// v2 должен отличаться от этих текстов только строгостью, не структурой ответа.

const V1_VISION: Record<VisionCheckId, string> = {
  no_text_on_main:
    "На фото есть текст, цифры, инфографика, плашки, рамки, коллажи, стикеры? Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = чисто, ничего нет), "confident": true/false, "bbox": {"x":0..1,"y":0..1,"width":0..1,"height":0..1} или null, "reason": "коротко что видишь"}. ' +
    "При сомнениях ставь confident=false.",
  no_watermark:
    "На фото есть водяные знаки, чужие логотипы, копирайты? Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = чисто), "confident": true/false, "bbox": {...} или null, "reason": "коротко"}. При сомнениях confident=false.',
  single_object:
    "Сколько отдельных товаров в кадре? Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = ровно один товар), "confident": true/false, "bbox": {бокс товара} или null, "reason": "коротко"}. При сомнениях confident=false.',
};

function buildCopyV1(args: CopyPromptArgs): string {
  return (
    `Ты пишешь карточку товара для маркетплейса ${args.marketplaceName}. ` +
    `Категория: ${args.category}. Смотри на фото и опиши именно этот товар, не выдумывай бренд и артикул. ` +
    `Ответь СТРОГО одним JSON без пояснений: {"title": "...", "description": "...", "specs": {"ключ": "значение"}}. ` +
    `Требования: title до ${args.titleMax} символов; ` +
    `description ${args.sentencesMin}-${args.sentencesMax} предложений, ` +
    `до ${args.descriptionMax} символов, без воды и без слова «идеальный» в любых формах; ` +
    `specs ${args.specsMin}-${args.specsMax} пар «характеристика: значение», коротко и по делу.`
  );
}

export const V1_PROMPTS: PromptSet = {
  id: "v1",
  composeId: "compose-v1",
  composeEnhancedId: "compose-v2-enhanced",
  identityId: "identity-v1",
  copyId: "copy-v1",
  segmentPrompt: (category: string) => category,
  identityJudgePrompt:
    "Это один и тот же товар до и после замены фона? Слева ДО, справа ПОСЛЕ. Ответь строго JSON {same, reason}.",
  buildCopyPrompt: buildCopyV1,
  visionPrompt: (checkId: VisionCheckId) => V1_VISION[checkId],
};
