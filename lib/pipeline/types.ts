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
