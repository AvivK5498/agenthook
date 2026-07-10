// Shared test harness: temp config dir, mocked global fetch (NO test touches
// the network), captured console output. The mocked /v1/tools payload is
// core's real TOOLS_JSON_SCHEMA (imported test-only via relative path — the
// published CLI has no runtime dependency on the workspace).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi, type Mock } from "vitest";
import { TOOLS_JSON_SCHEMA } from "../../core/contract";
import type { RunResponse } from "../src/types";

export const API = "https://localhost:3000";
export const V1 = `${API}/api/v1`;

export type FetchMock = Mock<(input: unknown, init?: RequestInit) => Promise<Response>>;

export interface Harness {
  dir: string;
  logs: string[];
  errs: string[];
  fetchMock: FetchMock;
  /** All fetched URLs, in order. */
  urls: () => string[];
}

export function setupHarness(): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pn-cli-"));
  process.env.AgentHook_CONFIG_DIR = dir;
  process.env.AgentHook_POLL_MS = "1";
  delete process.env.AgentHook_API_URL;

  const logs: string[] = [];
  const errs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logs.push(a.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errs.push(a.join(" "));
  });

  const fetchMock: FetchMock = vi.fn(async (input: unknown) => {
    throw new Error(`unexpected fetch: ${String(input)}`);
  }) as FetchMock;
  vi.stubGlobal("fetch", fetchMock);

  return {
    dir,
    logs,
    errs,
    fetchMock,
    urls: () => fetchMock.mock.calls.map((c) => String(c[0])),
  };
}

export function teardownHarness(h: Harness): void {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(h.dir, { recursive: true, force: true });
  delete process.env.AgentHook_CONFIG_DIR;
  delete process.env.AgentHook_POLL_MS;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function seedCredentials(dir: string, key = "pk_test", apiUrl?: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "credentials.json"),
    JSON.stringify({ api_key: key, ...(apiUrl ? { api_url: apiUrl } : {}) }),
  );
}

/** Seed a FRESH tools cache so `run` pre-validation needs zero network. */
export function seedToolsCache(dir: string, apiUrl = API): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tools-cache.json"),
    JSON.stringify({ [apiUrl]: { fetched_at: new Date().toISOString(), tools: TOOLS_JSON_SCHEMA } }),
  );
}

export function runRow(overrides: Partial<RunResponse> = {}): RunResponse {
  return {
    id: "run_1",
    tool: "make_video",
    model: "seedance-2",
    status: "queued",
    prompt: "a talking head",
    enhanced_prompt: null,
    params: {},
    reference_images: [],
    owns_references: false,
    credits_charged: 25,
    output: [],
    transcript: null,
    error: null,
    created_at: "2026-07-10T10:00:00Z",
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

export { TOOLS_JSON_SCHEMA };
