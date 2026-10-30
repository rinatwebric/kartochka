import type { JobState, JobStep } from "./types";

// TODO(T3): оркестратор шагов, идемпотентность, resume с места падения.
export async function runStep(_job: JobState, _step: JobStep): Promise<JobState> {
  throw new Error("TODO(T3): pipeline runner not implemented");
}
