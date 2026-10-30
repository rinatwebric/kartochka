import type { CopyPromptArgs, PromptSet, VisionCheckId } from "./registry";

// v2 — строгие формулировки: те же структуры ответов, что в v1, но vision-судье
// и glimmer явно запрещено додумывать, а segment просит товар целиком.
// Числа лимитов по-прежнему приходят из rules/*.json через аргументы.

const V2_VISION: Record<VisionCheckId, string> = {
  no_text_on_main:
    "На фото есть ХОТЬ ОДИН символ текста, цифра, инфографика, плашка, рамка, коллаж или стикер? Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = чисто, ничего нет), "confident": true/false, "bbox": {"x":0..1,"y":0..1,"width":0..1,"height":0..1} или null, "reason": "коротко что видишь"}. ' +
    "При малейшем сомнении ставь ok=false и confident=false. Не додумывай: нет символа — только тогда ok=true.",
  no_watermark:
    "На фото есть ХОТЬ КАКОЙ-ТО водяной знак, чужой логотип или копирайт, даже полупрозрачный? Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = чисто), "confident": true/false, "bbox": {...} или null, "reason": "коротко"}. При малейшем сомнении ok=false, confident=false.',
  single_object:
    "Сколько отдельных товаров в кадре? Посчитай внимательно: аксессуары и тени — не товар. Ответь СТРОГО одним JSON без пояснений: " +
    '{"ok": true/false (true = ровно один товар), "confident": true/false, "bbox": {бокс товара} или null, "reason": "коротко"}. При малейшем сомнении confident=false.',
};

function buildCopyV2(args: CopyPromptArgs): string {
  return (
    `Ты пишешь карточку товара для маркетплейса ${args.marketplaceName}. ` +
    `Категория: ${args.category}. Смотри на фото и опиши ТОЛЬКО то, что видно: именно этот товар, не выдумывай бренд, артикул и свойства. ` +
    `Ответь СТРОГО одним JSON без пояснений: {"title": "...", "description": "...", "specs": {"ключ": "значение"}}. ` +
    `Требования: title до ${args.titleMax} символов, фактами без превосходных степеней; ` +
    `description ${args.sentencesMin}-${args.sentencesMax} предложений, ` +
    `до ${args.descriptionMax} символов, без воды и без слова «идеальный» в любых формах; ` +
    `specs ${args.specsMin}-${args.specsMax} пар «характеристика: значение», коротко и по делу, ничего сверх видимого.`
  );
}

export const V2_PROMPTS: PromptSet = {
  id: "v2",
  composeId: "compose-v2",
  composeEnhancedId: "compose-v2-retry",
  identityId: "identity-v2",
  copyId: "copy-v2",
  segmentPrompt: (category: string) =>
    `single ${category}, whole object fully visible, centered, no cropping at edges`,
  identityJudgePrompt:
    "Это один и тот же товар до и после замены фона? Слева ДО, справа ПОСЛЕ. Сравни форму, цвет, логотип и пропорции. " +
    "При любом отличии товара ставь same=false. Ответь строго JSON {same, reason}.",
  buildCopyPrompt: buildCopyV2,
  visionPrompt: (checkId: VisionCheckId) => V2_VISION[checkId],
};
