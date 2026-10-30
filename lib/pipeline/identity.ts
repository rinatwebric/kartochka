// TODO(T4): identity gate, порог 0.90, формула из MASTER.md раздела 8.
export const IDENTITY_THRESHOLD = 0.9;

export async function checkIdentity(_before: string, _after: string): Promise<never> {
  throw new Error("TODO(T4): identity not implemented");
}
