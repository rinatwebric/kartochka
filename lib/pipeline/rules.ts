import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import { isMock } from "../env";
import { askSpark } from "../models/spark";
import {
  checklistItemSchema,
  type Borders,
  type ChecklistItem,
} from "./types";

// Движок регламента T5: все числа и пороги — только из rules/<marketplace>.json,
// в коде лишь исполнители типов проверок. Новая площадка = новый JSON-файл,
// код трогать не надо (это проверяет scripts/check-rules.ts через test.json).

export const RULES_CHECK_TYPES = [
  "pixels_white",
  "aspect",
  "min_size",
  "fill",
  "not_cropped",
  "no_text_on_main",
  "no_watermark",
  "single_object",
] as const;
export type RuleCheckType = (typeof RULES_CHECK_TYPES)[number];

const VISION_CHECK_IDS = ["no_text_on_main", "no_watermark", "single_object"] as const;
export type VisionCheckId = (typeof VISION_CHECK_IDS)[number];

const ruleCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Тип — свободная строка: неизвестный тип даёт человеческую ошибку
  // с именем файла, а не сухую zod-ошибку enum.
  type: z.string().min(1),
  weight: z.number().nonnegative(),
  params: z.record(z.string(), z.unknown()).optional(),
  fix: z.string().min(1),
});

const rulesFileSchema = z.object({
  name: z.string().min(1),
  checks: z.array(ruleCheckSchema).min(1),
});
export type RulesFile = z.infer<typeof rulesFileSchema>;
export type RuleCheck = RulesFile["checks"][number];

export interface CodeMetrics {
  width: number;
  height: number;
  aspect: number;
  fill: number;
  bgWhite: number;
  borders: Borders;
}

const visionBboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type VisionBbox = z.infer<typeof visionBboxSchema>;

export interface VisionVerdict {
  ok: boolean;
  bbox: VisionBbox | null;
  reason: string;
}

export type VisionMap = Record<VisionCheckId, VisionVerdict>;

export interface RulesResult {
  checklist: ChecklistItem[];
  compliance: number;
  score: number;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function numParam(params: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = params?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function minPair(params: Record<string, unknown> | undefined): [number, number] | undefined {
  const v = params?.["min"];
  if (
    Array.isArray(v) &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  ) {
    return [v[0], v[1]];
  }
  return undefined;
}

function fmtPctRange(min: number, max: number): string {
  return `${Math.round(min * 100)}–${Math.round(max * 100)}%`;
}

const SIDE_LABEL: Record<keyof Borders, string> = {
  left: "слева",
  right: "справа",
  top: "сверху",
  bottom: "снизу",
};

function touchedSides(borders: Borders): string[] {
  const out: string[] = [];
  const keys: Array<keyof Borders> = ["left", "right", "top", "bottom"];
  for (const k of keys) {
    if (borders[k]) out.push(SIDE_LABEL[k]);
  }
  return out;
}

function passItem(check: RuleCheck, measured: string): ChecklistItem {
  return checklistItemSchema.parse({
    id: check.id,
    label: check.label,
    ok: true,
    measured,
    weight: check.weight,
    fix: check.fix,
  });
}

function failItem(check: RuleCheck, measured: string, reason: string): ChecklistItem {
  return checklistItemSchema.parse({
    id: check.id,
    label: check.label,
    ok: false,
    measured,
    weight: check.weight,
    fix: check.fix,
    reason,
  });
}

function evalCodeCheck(check: RuleCheck, m: CodeMetrics, marketplace: string): ChecklistItem {
  switch (check.type) {
    case "pixels_white": {
      const threshold = numParam(check.params, "threshold");
      if (threshold === undefined) {
        throw new Error(
          `Регламент ${marketplace}: у проверки «${check.id}» нет params.threshold. Добавьте порог в rules/${marketplace}.json.`,
        );
      }
      const measured = `фон ${pct(m.bgWhite)} белый (норма ≥ ${pct(threshold)})`;
      if (m.bgWhite >= threshold) return passItem(check, measured);
      return failItem(
        check,
        measured,
        `белых пикселей ${pct(m.bgWhite)} вне маски, нужно ≥ ${pct(threshold)}: фон неоднородный, есть тени или серость`,
      );
    }
    case "aspect": {
      const ratio = numParam(check.params, "ratio");
      const tolerance = numParam(check.params, "tolerance") ?? 0.02;
      if (ratio === undefined) {
        throw new Error(
          `Регламент ${marketplace}: у проверки «${check.id}» нет params.ratio. Добавьте пропорцию в rules/${marketplace}.json.`,
        );
      }
      const measured = `пропорция ${m.width}×${m.height} (${m.aspect.toFixed(3)}, норма ${ratio}±${tolerance})`;
      if (Math.abs(m.aspect - ratio) <= tolerance) return passItem(check, measured);
      return failItem(
        check,
        measured,
        `соотношение сторон ${m.aspect.toFixed(3)} вне допуска ${ratio}±${tolerance}: кадр не той пропорции`,
      );
    }
    case "min_size": {
      const min = minPair(check.params);
      if (min === undefined) {
        throw new Error(
          `Регламент ${marketplace}: у проверки «${check.id}» нет params.min [w, h]. Добавьте минимум в rules/${marketplace}.json.`,
        );
      }
      const measured = `${m.width}×${m.height} px (минимум ${min[0]}×${min[1]} px)`;
      if (m.width >= min[0] && m.height >= min[1]) return passItem(check, measured);
      return failItem(check, measured, `кадр меньше минимума ${min[0]}×${min[1]} px: не хватит для зума`);
    }
    case "fill": {
      const min = numParam(check.params, "min");
      const max = numParam(check.params, "max");
      if (min === undefined || max === undefined) {
        throw new Error(
          `Регламент ${marketplace}: у проверки «${check.id}» нет params.min/max. Добавьте диапазон в rules/${marketplace}.json.`,
        );
      }
      const measured = `заполнение ${pct(m.fill)} (норма ${fmtPctRange(min, max)})`;
      if (m.fill >= min && m.fill <= max) return passItem(check, measured);
      const reason =
        m.fill < min
          ? `товар мелкий (${pct(m.fill)} < ${pct(min)}): обрежьте лишнее поле вокруг`
          : `товар забит впритык (${pct(m.fill)} > ${pct(max)}): отойдите на шаг`;
      return failItem(check, measured, reason);
    }
    case "not_cropped": {
      const sides = touchedSides(m.borders);
      if (sides.length === 0) return passItem(check, "товар целиком, края чистые");
      const measured = `товар касается края: ${sides.join(", ")}`;
      return failItem(check, measured, `маска упирается в край (${sides.join(", ")}) — товар обрезан, переснимите с отступом`);
    }
    default:
      break;
  }
  throw new Error(
    `Регламент ${marketplace}: неизвестный тип проверки «${check.type}» у пункта «${check.id}». Известные: ${RULES_CHECK_TYPES.join(", ")}.`,
  );
}

const VISION_LABEL_FALLBACK: Record<VisionCheckId, string> = {
  no_text_on_main: "Нет надписей и инфографики",
  no_watermark: "Нет водяных знаков",
  single_object: "В кадре один товар",
};

function evalVisionCheck(
  check: RuleCheck,
  verdict: VisionVerdict,
  checkId: VisionCheckId,
): ChecklistItem {
  const zone =
    verdict.bbox === null
      ? ""
      : ` (зона ${pct(verdict.bbox.x)}, ${pct(verdict.bbox.y)}, ${pct(verdict.bbox.width)}×${pct(verdict.bbox.height)})`;
  if (verdict.ok) {
    const cleanText: Record<VisionCheckId, string> = {
      no_text_on_main: "текста, рамок и инфографики нет",
      no_watermark: "водяных знаков нет",
      single_object: "в кадре один товар",
    };
    return passItem(check, `${cleanText[checkId]} — ${verdict.reason}`);
  }
  return failItem(check, `найдено: ${verdict.reason}${zone}`, verdict.reason);
}

// Чистая оценка: регламент + замеры кодом + готовые вердикты vision.
// Порядок пунктов — как в JSON, веса — оттуда же.
export function evaluateMarketplace(
  rules: RulesFile,
  marketplace: string,
  metrics: CodeMetrics,
  vision: VisionMap,
): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const check of rules.checks) {
    if (check.type === "no_text_on_main" || check.type === "no_watermark" || check.type === "single_object") {
      const id = check.type as VisionCheckId;
      out.push(evalVisionCheck(check, vision[id], id));
      continue;
    }
    out.push(evalCodeCheck(check, metrics, marketplace));
  }
  return out;
}

export function summarize(checklist: ChecklistItem[]): { compliance: number; score: number } {
  let total = 0;
  let passed = 0;
  for (const item of checklist) {
    total += item.weight;
    if (item.ok) passed += item.weight;
  }
  const compliance = total === 0 ? 0 : passed / total;
  return { compliance, score: Math.round(compliance * 100) };
}

function assertSafeName(name: string): void {
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error(`Площадка «${name}» не похожа на имя файла rules/*.json (только латиница, цифры, - и _).`);
  }
}

export async function loadRulesFile(marketplace: string): Promise<RulesFile> {
  assertSafeName(marketplace);
  let text: string;
  try {
    text = await readFile(join(process.cwd(), "rules", `${marketplace}.json`), "utf-8");
  } catch {
    throw new Error(`Регламент rules/${marketplace}.json не найден. Добавьте файл, чтобы завести новую площадку.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Регламент rules/${marketplace}.json сломан: не JSON. Проверьте файл.`);
  }
  const parsed = rulesFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Регламент rules/${marketplace}.json не прошёл схему (нужны name и checks[] с id/label/type/weight/fix).`);
  }
  return parsed.data;
}

// Точка входа для стенда и API: читает JSON площадки, считает кодовые пункты,
// vision берёт из overrides (стенд) — живые вердикты добывает judgeAllVision.
export async function checkMarketplace(
  marketplace: string,
  metrics: CodeMetrics,
  vision: VisionMap,
): Promise<RulesResult> {
  const rules = await loadRulesFile(marketplace);
  const checklist = evaluateMarketplace(rules, marketplace, metrics, vision);
  const { compliance, score } = summarize(checklist);
  return { checklist, compliance, score };
}

const visionResponseSchema = z.object({
  ok: z.boolean(),
  confident: z.boolean().optional(),
  bbox: visionBboxSchema.nullable().optional(),
  reason: z.string().min(1),
});

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

const VISION_PROMPT: Record<VisionCheckId, string> = {
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

const MOCK_VISION: VisionMap = {
  no_text_on_main: { ok: true, bbox: null, reason: "mock: текста, рамок и инфографики нет" },
  no_watermark: { ok: true, bbox: null, reason: "mock: водяных знаков нет" },
  single_object: {
    ok: true,
    bbox: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    reason: "mock: один товар в кадре",
  },
};

// Вердикт vision по одному пункту: в mock — детерминированный pass,
// вживую — через muse-spark с обязательным reason; без уверенности — честный провал.
export async function judgeVisionCheck(imageB64: string, checkId: VisionCheckId): Promise<VisionVerdict> {
  if (isMock()) {
    return MOCK_VISION[checkId];
  }
  let text: string;
  try {
    text = await askSpark(VISION_PROMPT[checkId], imageB64);
  } catch (err) {
    return {
      ok: false,
      bbox: null,
      reason: `модель недоступна: ${err instanceof Error ? err.message : "ошибка вызова"} — считаем провалом`,
    };
  }
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch {
    return { ok: false, bbox: null, reason: "модель не дала уверенного ответа (не JSON) — считаем провалом" };
  }
  const parsed = visionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, bbox: null, reason: "модель не дала уверенного ответа (нет bbox/reason) — считаем провалом" };
  }
  if (parsed.data.confident === false) {
    return { ok: false, bbox: parsed.data.bbox ?? null, reason: `модель не уверена: ${parsed.data.reason}` };
  }
  return { ok: parsed.data.ok, bbox: parsed.data.bbox ?? null, reason: parsed.data.reason };
}

export async function judgeAllVision(imageB64: string): Promise<VisionMap> {
  const [noText, noWatermark, single] = await Promise.all([
    judgeVisionCheck(imageB64, "no_text_on_main"),
    judgeVisionCheck(imageB64, "no_watermark"),
    judgeVisionCheck(imageB64, "single_object"),
  ]);
  return { no_text_on_main: noText, no_watermark: noWatermark, single_object: single };
}

async function imagePathToDataUrl(imagePath: string): Promise<string> {
  const data = await readFile(imagePath);
  const ext = extname(imagePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${data.toString("base64")}`;
}

// Полный прогон по джобе: собирает замеры из шагов inspect/compose/whitebg,
// vision судит по финальному кадру. Используется runner-шагом «rules».
export async function checkRules(jobId: string): Promise<RulesResult> {
  const { loadJob, readStepResult } = await import("./state");
  const { maskTouchesBorders } = await import("./inspect");
  const { composeResultSchema, inspectMetricsSchema, whitebgResultSchema } = await import("./types");
  const job = await loadJob(jobId);
  const [inspect, compose, whitebg] = await Promise.all([
    readStepResult<unknown>(jobId, "inspect"),
    readStepResult<unknown>(jobId, "compose"),
    readStepResult<unknown>(jobId, "whitebg"),
  ]);
  if (compose === null || whitebg === null) {
    const { StepError } = await import("./state");
    throw new StepError(
      409,
      "Сначала выполните compose и whitebg: без финального кадра регламент проверять нечего.",
      compose === null ? ["compose", "whitebg"] : ["whitebg"],
    );
  }
  const composeParsed = composeResultSchema.parse(compose);
  const whitebgParsed = whitebgResultSchema.parse(whitebg);
  const inspectParsed = inspect === null ? null : inspectMetricsSchema.safeParse(inspect);
  const width = composeParsed.width;
  const height = composeParsed.height;
  let borders: Borders = { left: false, right: false, top: false, bottom: false };
  try {
    borders = await maskTouchesBorders(composeParsed.maskPath);
  } catch {
    borders = { left: false, right: false, top: false, bottom: false };
  }
  const metrics: CodeMetrics = {
    width,
    height,
    aspect: width / height,
    fill: composeParsed.fill,
    bgWhite: whitebgParsed.bgWhite,
    borders,
  };
  void inspectParsed;
  const vision = await judgeAllVision(await imagePathToDataUrl(whitebgParsed.outPath));
  return checkMarketplace(job.marketplace, metrics, vision);
}

export { VISION_CHECK_IDS, VISION_LABEL_FALLBACK };
