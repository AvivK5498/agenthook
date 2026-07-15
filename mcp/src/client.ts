// Bearer HTTP client — ported 1:1 from packages/cli/src/http.ts + run.ts.
// Standalone: the published package cannot runtime-import @getagenthook/core,
// so the minimal wire types are mirrored here (packages/core/contract.ts).
import { randomUUID } from "node:crypto";

const BASE_PATH = "/api/v1";
const DEFAULT_API_URL = "https://getagenthook.com";
const DEFAULT_TIMEOUT_MS = 30_000;
// Sent as the User-Agent so the API can attribute runs to the MCP surface in
// PostHog. Kept in sync with package.json by test/client.test.ts.
export const VERSION = "1.0.1";
const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
// One transient re-submit with the SAME idempotency key (never double-charge —
// the server dedupes on the key). Mirrors cli/src/commands/run.ts.
const SUBMIT_RETRIES = 1;

// ── wire types (mirror packages/core/contract.ts) ──
export type RunState = "queued" | "processing" | "completed" | "failed";

export interface ToolParamSpec {
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
  default?: unknown;
  enum?: readonly string[];
  items?: { type: string };
  min?: number;
  max?: number;
  maxLength?: number;
  description?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  params: Record<string, ToolParamSpec>;
}

export interface ToolsResponse {
  tools: ToolSchema[];
}

/** POST /api/v1/tools/:tool/run → 202 */
export interface RunCreatedResponse {
  run_id: string;
  status: RunState;
  credits_charged: number;
}

/** GET /api/v1/runs/:id */
export interface RunResponse {
  id: string;
  tool: string;
  model: string | null;
  status: RunState;
  prompt: string | null;
  enhanced_prompt: string | null;
  params: Record<string, unknown>;
  reference_images: string[];
  owns_references: boolean;
  credits_charged: number;
  output: string[];
  transcript: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ErrorBody {
  error?: string;
  code?: string;
  details?: { path: string; message: string }[];
  retry_after?: number;
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

/** Resolution order mirrors the CLI: AGENTHOOK_API_URL env, then default.
 * Enforces https:// so a hostile/misconfigured env can't redirect the Bearer
 * key to a cleartext or attacker-controlled host (and poison the fetched tool
 * descriptions). http:// is allowed ONLY for localhost, for local dev. */
export function resolveApiUrl(): string {
  const raw = (process.env.AGENTHOOK_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`AGENTHOOK_API_URL is not a valid URL: ${raw}`);
  }
  const isLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && isLocalhost)) {
    throw new Error(`AGENTHOOK_API_URL must use https:// (got ${u.protocol}//${u.hostname}). http:// is allowed only for localhost.`);
  }
  return raw;
}

/** AGENTHOOK_API_KEY env only (no on-disk credentials in the MCP server). */
export function resolveApiKey(): string | undefined {
  return process.env.AGENTHOOK_API_KEY || undefined;
}

interface RequestOptions {
  method?: string;
  key?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Bounded JSON request against <apiUrl>/api/v1<pathname>. Checks res.ok before
 * res.json() (donor rule) and normalizes every failure to ApiError. */
async function api<T>(apiUrl: string, pathname: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(apiUrl + BASE_PATH + pathname);
  const headers: Record<string, string> = { "user-agent": `agenthook-mcp/${VERSION}`, ...opts.headers };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
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

/** GET /api/v1/tools — the single live schema source. */
export async function fetchTools(): Promise<ToolSchema[]> {
  const res = await api<ToolsResponse>(resolveApiUrl(), "/tools", { key: resolveApiKey() });
  return res.tools;
}

/** POST /api/v1/tools/:tool/run — submit, retrying only transient network
 * failures (status 0) with the SAME idempotency key so a hiccup mid-submit
 * never double-charges. */
export async function submitRun(tool: string, input: Record<string, unknown>): Promise<RunCreatedResponse> {
  const apiUrl = resolveApiUrl();
  const key = resolveApiKey();
  const idempotencyKey = randomUUID();
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<RunCreatedResponse>(apiUrl, `/tools/${encodeURIComponent(tool)}/run`, {
        method: "POST",
        key,
        body: input,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0 && attempt < SUBMIT_RETRIES) continue;
      throw e;
    }
  }
}

/** GET /api/v1/runs/:id — a SINGLE status read (the MCP client polls per call,
 * there is no loop here — cf. cli/src/commands/run.ts which loops). */
export async function getRun(id: string): Promise<RunResponse> {
  return api<RunResponse>(resolveApiUrl(), `/runs/${encodeURIComponent(id)}`, { key: resolveApiKey() });
}
