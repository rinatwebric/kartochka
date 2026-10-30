export interface MetaCallOptions {
  model: string;
  payload: Record<string, string>;
}

export interface MetaCallResult {
  text: string;
  ms: number;
  credits: number;
  status: number;
}

// TODO(T2): единый fetch-клиент с таймаутом, ретраями 429/5xx, логом и счётчиком кредитов.
export async function callMeta(_opts: MetaCallOptions): Promise<MetaCallResult> {
  throw new Error("TODO(T2): meta client not implemented");
}
