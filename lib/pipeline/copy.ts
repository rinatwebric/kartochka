import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import { isMock } from "../env";
import { SPARK_MODEL, askSpark } from "../models/spark";
import { loadJob, readStepResult, saveJob } from "./state";
import { marketplaceSchema } from "./types";

// Текст карточки T6: muse-spark по фото (и категории) даёт title/description/specs.
// Все числа — только из rules/<marketplace>.json (limits), в коде их нет.

export const COPY_PROMPT_ID = "copy-v1";
export const COPY_MODEL = SPARK_MODEL;

// Запрещённое слово по ТЗ + все его формы одним корнем.
const BANNED_WORD_PATTERN = /идеальн/iu;

const SPECS_MIN = 5;
const SPECS_MAX = 8;
const SPEC_VALUE_MAX = 200;
const DESCRIPTION_SENTENCES_MIN = 3;
const DESCRIPTION_SENTENCES_MAX = 5;

export const copySchema = z.object({
  title: z.string(),
  description: z.string(),
  specs: z.record(z.string(), z.string()),
});
export type Copy = z.infer<typeof copySchema>;

export interface CopyLimits {
  titleMax: number;
  descriptionMax: number;
}

const limitsFileSchema = z.object({
  limits: z.object({
    title_max: z.number().int().positive(),
    description_max: z.number().int().positive(),
  }),
});

export async function readCopyLimits(marketplace: string): Promise<CopyLimits> {
  marketplaceSchema.parse(marketplace);
  let text: string;
  try {
    text = await readFile(join(process.cwd(), "rules", `${marketplace}.json`), "utf-8");
  } catch {
    throw new Error(`Регламент rules/${marketplace}.json не найден: лимиты текста взять негде.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Регламент rules/${marketplace}.json сломан: не JSON. Проверьте файл.`);
  }
  const parsed = limitsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Регламент rules/${marketplace}.json без limits.title_max/description_max: добавьте лимиты, свои числа не подбираем.`,
    );
  }
  return {
    titleMax: parsed.data.limits.title_max,
    descriptionMax: parsed.data.limits.description_max,
  };
}

// Предложения без lookbehind (цель сборки — ES2017, см. DECISIONS T4).
export function splitSentences(text: string): string[] {
  const matched = text.match(/[^.!?…]+[.!?…]+/gu);
  if (matched !== null) {
    return matched.map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripBannedWord(text: string): string {
  return collapseSpaces(text.replace(BANNED_WORD_PATTERN, ""));
}

function truncateTitle(title: string, max: number): string {
  const clean = collapseSpaces(title);
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trim().replace(/[,.;:…!?\-—]+$/u, "").trim();
}

function truncateDescription(description: string, max: number): string {
  const clean = collapseSpaces(description);
  if (clean.length <= max) return clean;
  const sentences = splitSentences(clean);
  const kept: string[] = [];
  let length = 0;
  for (const s of sentences) {
    const add = (kept.length > 0 ? 1 : 0) + s.length;
    if (length + add > max) break;
    kept.push(s);
    length += add;
  }
  if (kept.length > 0) return kept.join(" ");
  return clean.slice(0, max).trim();
}

// Нормализация сырого ответа модели к лимитам площадки: режем лишнее,
// запрещённое слово вычищаем, пустоты отбрасываем. Недобор (мало предложений
// или пар) не дорисовываем — это честная ошибка валидации ниже.
export function normalizeCopy(raw: unknown, limits: CopyLimits): Copy {
  const loose = z
    .object({ title: z.unknown(), description: z.unknown(), specs: z.unknown() })
    .safeParse(raw);
  const titleRaw = loose.success && typeof loose.data.title === "string" ? loose.data.title : "";
  const descRaw =
    loose.success && typeof loose.data.description === "string" ? loose.data.description : "";
  const specsRaw: unknown = loose.success ? loose.data.specs : undefined;

  const title = truncateTitle(stripBannedWord(titleRaw), limits.titleMax);

  let description = stripBannedWord(descRaw);
  const sentences = splitSentences(description).slice(0, DESCRIPTION_SENTENCES_MAX);
  description = truncateDescription(sentences.join(" "), limits.descriptionMax);

  const entries: Array<[string, string]> = [];
  if (specsRaw !== null && typeof specsRaw === "object" && !Array.isArray(specsRaw)) {
    for (const [k, v] of Object.entries(specsRaw as Record<string, unknown>)) {
      const key = collapseSpaces(String(k));
      const value = collapseSpaces(typeof v === "string" ? v : String(v ?? ""));
      if (key.length === 0 || value.length === 0) continue;
      entries.push([key, value.slice(0, SPEC_VALUE_MAX)]);
      if (entries.length >= SPECS_MAX) break;
    }
  }
  return copySchema.parse({ title, description, specs: Object.fromEntries(entries) });
}

// Проверка готового текста: длины по rules/limits, 3-5 предложений,
// без «идеальн*», 5-8 пар характеристик.
export function validateCopy(copy: Copy, limits: CopyLimits): string[] {
  const errors: string[] = [];
  if (copy.title.length === 0) errors.push("пустой заголовок: модель не дала title");
  if (copy.title.length > limits.titleMax) {
    errors.push(`заголовок ${copy.title.length} символов при лимите ${limits.titleMax}`);
  }
  if (BANNED_WORD_PATTERN.test(copy.title)) errors.push("в заголовке запрещённое слово «идеальный»");
  if (copy.description.length === 0) errors.push("пустое описание: модель не дала description");
  if (copy.description.length > limits.descriptionMax) {
    errors.push(`описание ${copy.description.length} символов при лимите ${limits.descriptionMax}`);
  }
  const sentences = splitSentences(copy.description);
  if (sentences.length < DESCRIPTION_SENTENCES_MIN || sentences.length > DESCRIPTION_SENTENCES_MAX) {
    errors.push(
      `в описании ${sentences.length} предложений, нужно ${DESCRIPTION_SENTENCES_MIN}-${DESCRIPTION_SENTENCES_MAX}`,
    );
  }
  if (BANNED_WORD_PATTERN.test(copy.description)) {
    errors.push("в описании запрещённое слово «идеальный»");
  }
  const specs = Object.entries(copy.specs);
  if (specs.length < SPECS_MIN || specs.length > SPECS_MAX) {
    errors.push(`характеристик ${specs.length}, нужно ${SPECS_MIN}-${SPECS_MAX} пар`);
  }
  for (const [k, v] of specs) {
    if (k.length === 0) errors.push("пустое название характеристики");
    if (v.length === 0) errors.push(`пустое значение у характеристики «${k}»`);
    if (v.length > SPEC_VALUE_MAX) {
      errors.push(`значение «${k}» длиннее ${SPEC_VALUE_MAX} символов`);
    }
    if (BANNED_WORD_PATTERN.test(`${k} ${v}`)) {
      errors.push(`в характеристике «${k}» запрещённое слово «идеальный»`);
    }
  }
  return errors;
}

function mockCopyFor(limits: CopyLimits): Copy {
  const candidate: Copy = {
    title: "Кружка керамическая белая, 300 мл",
    description:
      "Керамическая кружка объёмом 300 мл для дома и офиса. " +
      "Гладкая глазурь легко моется и не впитывает запахи. " +
      "Удобная ручка держит хват даже с горячим напитком.",
    specs: {
      "Объём": "300 мл",
      "Материал": "керамика",
      "Цвет": "белый",
      "Высота": "95 мм",
      "Диаметр": "80 мм",
      "Уход": "можно мыть в посудомоечной машине",
    },
  };
  return normalizeCopy(candidate, limits);
}

function buildCopyPrompt(args: {
  marketplaceName: string;
  category: string;
  limits: CopyLimits;
}): string {
  return (
    `Ты пишешь карточку товара для маркетплейса ${args.marketplaceName}. ` +
    `Категория: ${args.category}. Смотри на фото и опиши именно этот товар, не выдумывай бренд и артикул. ` +
    `Ответь СТРОГО одним JSON без пояснений: {"title": "...", "description": "...", "specs": {"ключ": "значение"}}. ` +
    `Требования: title до ${args.limits.titleMax} символов; ` +
    `description ${DESCRIPTION_SENTENCES_MIN}-${DESCRIPTION_SENTENCES_MAX} предложений, ` +
    `до ${args.limits.descriptionMax} символов, без воды и без слова «идеальный» в любых формах; ` +
    `specs ${SPECS_MIN}-${SPECS_MAX} пар «характеристика: значение», коротко и по делу.`
  );
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

async function imagePathToDataUrl(imagePath: string): Promise<string> {
  const data = await readFile(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${data.toString("base64")}`;
}

const stepOutPathSchema = z.object({ outPath: z.string().min(1) });

async function pickCopyImage(jobId: string, fallbackSource: string): Promise<string> {
  const whitebg = await readStepResult<unknown>(jobId, "whitebg");
  const whiteParsed = whitebg === null ? null : stepOutPathSchema.safeParse(whitebg);
  if (whiteParsed !== null && whiteParsed.success) return whiteParsed.data.outPath;
  const compose = await readStepResult<unknown>(jobId, "compose");
  const composeParsed = compose === null ? null : stepOutPathSchema.safeParse(compose);
  if (composeParsed !== null && composeParsed.success) return composeParsed.data.outPath;
  return fallbackSource;
}

function marketplaceName(marketplace: string): string {
  if (marketplace === "wb") return "Wildberries";
  if (marketplace === "ozon") return "Ozon";
  if (marketplace === "amazon") return "Amazon";
  return marketplace;
}

// Точка входа шага copy: лимиты из rules, в mock — детерминированная фикстура,
// вживую — muse-spark по финальному кадру. Результат пишет в job.copy.
export async function writeCopy(jobId: string, category = "товар"): Promise<Copy> {
  const job = await loadJob(jobId);
  const limits = await readCopyLimits(job.marketplace);
  let copy: Copy;
  if (isMock()) {
    copy = mockCopyFor(limits);
  } else {
    const imagePath = await pickCopyImage(jobId, job.assets.source);
    const prompt = buildCopyPrompt({
      marketplaceName: marketplaceName(job.marketplace),
      category: category.trim().length > 0 ? category.trim() : "товар",
      limits,
    });
    let text: string;
    try {
      text = await askSpark(prompt, await imagePathToDataUrl(imagePath));
    } catch (err) {
      throw new Error(
        `muse-spark не ответил на текст карточки: ${err instanceof Error ? err.message : "ошибка вызова"}. Попробуйте шаг ещё раз.`,
      );
    }
    let raw: unknown;
    try {
      raw = extractJsonObject(text);
    } catch {
      throw new Error("muse-spark дал не JSON для карточки: попробуйте шаг ещё раз.");
    }
    copy = normalizeCopy(raw, limits);
  }
  const errors = validateCopy(copy, limits);
  if (errors.length > 0) {
    throw new Error(`Текст не прошёл лимиты площадки: ${errors.join("; ")}. Попробуйте шаг ещё раз.`);
  }
  const { writeStepResult } = await import("./state");
  await writeStepResult(jobId, "copy", copy);
  const current = await loadJob(jobId);
  current.copy = copy;
  current.promptIds.copy = COPY_PROMPT_ID;
  await saveJob(current);
  return copy;
}

// Человеческий текст карточки: он же ляжет в ZIP как card.txt.
export function formatCardTxt(copy: Copy): string {
  const lines: string[] = [copy.title, "", copy.description, "", "Характеристики:"];
  for (const [key, value] of Object.entries(copy.specs)) {
    lines.push(`- ${key}: ${value}`);
  }
  return `${lines.join("\n")}\n`;
}
