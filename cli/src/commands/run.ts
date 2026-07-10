import { parseArgs, type FlagSpec } from "../args";
import { resolveApiUrl, storedApiKey } from "../config";
import { api, ApiError, describeApiError } from "../http";
import { getLocalToolSchemas } from "../schemas";
import { buildToolInput, preValidate } from "../validate";
import type { RunCreatedResponse, RunResponse } from "../types";

const RUN_FLAGS: FlagSpec = {
  "api-url": "string",
  prompt: "string",
  ref: "array",
  "owns-references": "boolean",
  model: "string",
  quality: "string",
  duration: "number",
  "aspect-ratio": "string",
  "no-audio": "boolean",
  captions: "boolean",
  "caption-style": "string",
  "enhance-prompt": "boolean",
  "video-url": "string",
  style: "string",
  count: "number",
  resolution: "string",
  language: "string",
};

// Poll cadence: 5s (spec); overridable for tests. Every watcher gets a
// give-up (donor rule): a wall-clock deadline + bounded consecutive misses.
const pollIntervalMs = () => Number(process.env.AGENTHOOK_POLL_MS || 5000);
const POLL_DEADLINE_MS = 60 * 60 * 1000; // the server sweep fails stuck runs at 45min; we outlast it
const MAX_POLL_MISSES = 5;

export async function run(argv: string[]): Promise<number> {
  const { positionals, flags, errors } = parseArgs(argv, RUN_FLAGS);
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return 1;
  }
  const tool = positionals[0];
  if (!tool) {
    console.error("Usage: agenthook run <tool> [flags] — see `agenthook tools`");
    return 1;
  }
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  const key = storedApiKey();
  if (!key) {
    console.error("Not logged in — run `agenthook login` first.");
    return 1;
  }

  // Deterministic pre-validation BEFORE any network call (spec §3) — schemas
  // resolve locally in every case: cached /v1/tools fetch if one exists,
  // otherwise the bundled snapshot (fresh install, offline). The server
  // re-validates authoritatively on submit.
  const schemas = getLocalToolSchemas(apiUrl);
  const input = buildToolInput(flags);
  const problems = preValidate(tool, input, schemas);
  if (problems.length) {
    problems.forEach((p) => console.error(p));
    return 1;
  }

  // Submit.
  let created: RunCreatedResponse;
  try {
    created = await api<RunCreatedResponse>(apiUrl, `/tools/${encodeURIComponent(tool)}/run`, {
      method: "POST",
      key,
      body: input,
    });
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(describeApiError(e));
      return 1;
    }
    throw e;
  }
  console.error(`Run ${created.run_id} submitted (${created.credits_charged} credits). Polling…`);

  // Poll until terminal. Progress goes to stderr; output URLs alone go to
  // stdout so agents/scripts can capture them cleanly.
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let lastStatus: string = created.status;
  let misses = 0;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs());
    let runRow: RunResponse;
    try {
      runRow = await api<RunResponse>(apiUrl, `/runs/${encodeURIComponent(created.run_id)}`, { key });
      misses = 0;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        console.error(`Run ${created.run_id} no longer exists (404).`);
        return 1;
      }
      misses++;
      if (misses >= MAX_POLL_MISSES) {
        console.error(
          `Lost contact with the API (${MAX_POLL_MISSES} consecutive failures: ${(e as Error).message}).\n` +
            `The run may still finish — check later with: agenthook list`,
        );
        return 1;
      }
      continue;
    }
    if (runRow.status !== lastStatus) {
      console.error(`Status: ${runRow.status}`);
      lastStatus = runRow.status;
    }
    if (runRow.status === "completed") {
      for (const url of runRow.output) console.log(url);
      return 0;
    }
    if (runRow.status === "failed") {
      console.error(`Run failed: ${runRow.error ?? "unknown error"} (credits are refunded automatically)`);
      return 1;
    }
  }
  console.error(
    `Run ${created.run_id} did not finish within ${POLL_DEADLINE_MS / 60_000} minutes — ` +
      `giving up on polling. Check later with: agenthook list`,
  );
  return 1;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
