import { BASE_PATH } from "./config";
import type { ErrorBody } from "./types";

// Timeout policy mirrors the frozen packages/core/net.ts (DEFAULT_TIMEOUT_MS +
// AbortSignal.timeout). Duplicated here because the published CLI cannot
// runtime-import workspace TypeScript; test/parity.test.ts pins the value.
export const DEFAULT_TIMEOUT_MS = 30_000;

export function timeoutSignal(ms: number = DEFAULT_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number, // 0 = network/timeout, no HTTP response
    readonly code?: string,
    readonly details?: { path: string; message: string }[],
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions {
  method?: string;
  key?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

/** Bounded JSON request against <apiUrl>/api/v1<pathname>. Checks res.ok
 * before res.json() (donor rule) and normalizes every failure to ApiError. */
export async function api<T>(apiUrl: string, pathname: string, opts: ApiRequestOptions = {}): Promise<T> {
  const url = new URL(apiUrl + BASE_PATH + pathname);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: timeoutSignal(),
    });
  } catch (e) {
    throw new ApiError(`request to ${url.host} failed: ${(e as Error).message}`, 0);
  }
  if (!res.ok) {
    let body: ErrorBody | undefined;
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // non-JSON error body — fall through to the status line
    }
    throw new ApiError(
      body?.error ?? `HTTP ${res.status} ${res.statusText}`,
      res.status,
      body?.code,
      body?.details,
      body?.retry_after,
    );
  }
  return (await res.json()) as T;
}

/** Human rendering for ApiError — validation details, login/429 hints. */
export function describeApiError(e: ApiError): string {
  const lines = [e.message];
  for (const d of e.details ?? []) lines.push(`  ${d.path}: ${d.message}`);
  if (e.status === 401) lines.push("  Run `agenthook login` with a valid API key.");
  if (e.status === 402) lines.push("  Not enough credits — check `agenthook balance`.");
  if (e.status === 429) lines.push(`  Rate limited — retry in ${e.retryAfter ?? "a few"}s.`);
  return lines.join("\n");
}
