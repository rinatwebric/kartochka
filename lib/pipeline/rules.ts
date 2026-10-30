import type { ChecklistItem } from "./types";

// TODO(T5): движок регламента из rules/<marketplace>.json, compliance и score.
export async function checkRules(_jobId: string): Promise<ChecklistItem[]> {
  throw new Error("TODO(T5): rules engine not implemented");
}
