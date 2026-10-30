import { z } from "zod";

export const marketplaceSchema = z.enum(["wb", "ozon", "amazon"]);
export type Marketplace = z.infer<typeof marketplaceSchema>;

export const jobStatusSchema = z.enum(["queued", "running", "done", "failed"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobStepSchema = z.enum([
  "inspect",
  "segment",
  "compose",
  "whitebg",
  "identity",
  "rules",
  "copy",
  "export",
]);
export type JobStep = z.infer<typeof jobStepSchema>;

export const checklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  ok: z.boolean(),
  measured: z.string(),
  weight: z.number(),
  fix: z.string().optional(),
  reason: z.string().optional(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

// T3: метрики inspect — размеры, пропорции, резкость, касание краёв.
// Пороги fill/bg_white живут в rules/*.json, здесь только замеры.
export const bordersSchema = z.object({
  left: z.boolean(),
  right: z.boolean(),
  top: z.boolean(),
  bottom: z.boolean(),
});
export type Borders = z.infer<typeof bordersSchema>;

export const inspectMetricsSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspect: z.number().positive(),
  sharpness: z.number().nonnegative(),
  lowSharpness: z.boolean(),
  borders: bordersSchema,
  format: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});
export type InspectMetrics = z.infer<typeof inspectMetricsSchema>;

export const bboxSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Bbox = z.infer<typeof bboxSchema>;

export const samBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});
export type SamBox = z.infer<typeof samBoxSchema>;

export const segmentResultSchema = z.object({
  maskPath: z.string().min(1),
  bbox: bboxSchema,
  fill: z.number().min(0).max(1),
  maskWidth: z.number().int().positive(),
  maskHeight: z.number().int().positive(),
  method: z.enum(["sam-mask", "sam-boxes", "background-removal"]),
  samBoxes: z.array(samBoxSchema).optional(),
});
export type SegmentResult = z.infer<typeof segmentResultSchema>;

export const composeResultSchema = z.object({
  outPath: z.string().min(1),
  maskPath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fill: z.number().min(0).max(1),
  targetFill: z.number().min(0).max(1),
  modelUsed: z.boolean(),
});
export type ComposeResult = z.infer<typeof composeResultSchema>;

export const whitebgResultSchema = z.object({
  outPath: z.string().min(1),
  bgWhite: z.number().min(0).max(1),
  changedInside: z.number().min(0).max(1),
  edgePreserved: z.boolean(),
  rolledBack: z.boolean(),
});
export type WhitebgResult = z.infer<typeof whitebgResultSchema>;

export const jobMetricsSchema = z.object({
  identity: z.number(),
  compliance: z.number(),
  retries: z.number(),
  productFill: z.number(),
  score: z.number(),
  credits: z.number(),
  ms: z.number(),
});
export type JobMetrics = z.infer<typeof jobMetricsSchema>;

export const jobStateSchema = z.object({
  id: z.string(),
  marketplace: marketplaceSchema,
  status: jobStatusSchema,
  step: jobStepSchema,
  attempts: z.object({
    compose: z.number(),
    identity: z.number(),
  }),
  metrics: jobMetricsSchema,
  checklist: z.array(checklistItemSchema),
  copy: z.object({
    title: z.string(),
    description: z.string(),
    specs: z.record(z.string(), z.string()),
  }),
  assets: z.object({
    source: z.string(),
    main: z.string().optional(),
    lifestyle: z.string().optional(),
    detail: z.string().optional(),
  }),
  promptIds: z.object({
    compose: z.string(),
    identity: z.string(),
    copy: z.string(),
  }),
  error: z.string().nullable(),
});
export type JobState = z.infer<typeof jobStateSchema>;
