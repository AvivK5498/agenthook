// Wire-contract types, mirroring the frozen packages/core/contract.ts.
//
// The CLI publishes standalone to npm and therefore cannot runtime-import
// workspace TypeScript, so these are type-only mirrors of the HTTP contract.
// test/parity.test.ts imports core (test-only, relative path) and pins the
// values that could drift.

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

/** POST /v1/tools/:tool/run → 202 */
export interface RunCreatedResponse {
  run_id: string;
  status: RunState;
  credits_charged: number;
}

/** GET /v1/runs/:id */
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

/** GET /v1/generations */
export interface GenerationsResponse {
  runs: RunResponse[];
  next_cursor: string | null;
}

/** GET /v1/me */
export interface MeResponse {
  user_id: string;
  balance: number;
  suspended: boolean;
}

/** GET /v1/credits/history */
export interface LedgerEntry {
  id: string;
  run_id: string | null;
  delta: number;
  reason: "grant" | "debit" | "refund";
  created_at: string;
}

export interface CreditsHistoryResponse {
  entries: LedgerEntry[];
  balance: number;
  next_cursor: string | null;
}

/** Uniform error body. */
export interface ErrorBody {
  error: string;
  code?: string;
  details?: { path: string; message: string }[];
  retry_after?: number;
}
