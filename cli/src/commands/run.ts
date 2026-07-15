import * as crypto from "node:crypto";
import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT, exitCodeForApiError, type ExitCode } from "../exit";
import { deriveRunFlags } from "../flags";
import { api, ApiError, describeApiError } from "../http";
import { appendJob } from "../jobs";
import { resolveRunSchemas } from "../schemas";
import { IDEMPOTENCY_KEY_HEADER } from "../types";
import { buildToolInput, preValidate } from "../validate";
import type { DryRunResponse, RunCreatedResponse, RunResponse } from "../types";

// Poll cadence: 5s (spec); overridable for tests. Every watcher gets a
// give-up (donor rule): a wall-clock deadline + bounded consecutive misses.
const pollIntervalMs = () => Number(process.env.AGENTHOOK_POLL_MS || 5000);
const POLL_DEADLINE_MS = 60 * 60 * 1000; // the server sweep fails stuck runs at 45min; we outlast it
const MAX_POLL_MISSES = 5;
// One transient re-submit with the SAME idempotency key (spec AC7 — a retried
// submit must never double-charge; the server dedupes on the key).
const SUBMIT_RETRIES = 1;

export async function run(argv: string[]): Promise<number> {
  // Flags are DERIVED from the live tool schema (so a new API param is a usable
  // flag without a CLI upgrade), and the schema source is per-api-url — so the
  // api-url is pulled from argv BEFORE the full parse, the schema is resolved,
  // then the flag spec is built to parse against.
  const apiUrl = resolveApiUrl(preScanApiUrl(argv));
  const schemas = await resolveRunSchemas(apiUrl);
  const { spec, paramForFlag, flagFor } = deriveRunFlags(schemas);

  const { positionals, flags, errors } = parseArgs(argv, spec);
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const asJson = flags["json"] === true;
  const tool = positionals[0];
  if (!tool) {
    console.error("Usage: agenthook run <tool> [flags] — see `agenthook tools`");
    return EXIT.GENERIC;
  }
  const key = resolveApiKey(flags["key"] as string | undefined);
  if (!key) {
    emitError(asJson, "Not logged in — run `agenthook auth:login` first.", EXIT.AUTH);
    return EXIT.AUTH;
  }

  // Deterministic pre-validation BEFORE the run is submitted (spec §3): every
  // locally-checkable rule the server would 400 on. The server re-validates
  // authoritatively on submit.
  const input = buildToolInput(flags, paramForFlag);
  const problems = preValidate(tool, input, schemas, flagFor);
  if (problems.length) {
    if (asJson) emitError(true, problems.join("; "), EXIT.VALIDATION);
    else problems.forEach((p) => console.error(p));
    return EXIT.VALIDATION;
  }

  // Free pre-flight: POST with `dry_run` so the server prices + validates
  // authoritatively without creating a run or debiting. No idempotency key
  // (nothing is charged) and no poll — the priced response is terminal.
  if (flags["dry-run"] === true) {
    let dry: DryRunResponse;
    try {
      dry = await api<DryRunResponse>(apiUrl, `/tools/${encodeURIComponent(tool)}/run`, {
        method: "POST",
        key,
        body: { ...input, dry_run: true },
      });
    } catch (e) {
      if (e instanceof ApiError) {
        const code = exitCodeForApiError(e);
        if (asJson) emitError(true, e.message, code, e.status === 402 ? topUpUrl(apiUrl) : undefined, e.details);
        else console.error(describeApiError(e));
        return code;
      }
      throw e;
    }
    if (asJson) emit(dry);
    else console.log(`Would cost ${dry.credits_required} credits${dry.model ? ` (model ${dry.model})` : ""}. No credits charged.`);
    return EXIT.OK;
  }

  // Idempotency key generated once and reused across transient re-submits, so
  // a network hiccup mid-submit can retry without a second debit (spec AC5/AC7).
  const idempotencyKey = crypto.randomUUID();

  let created: RunCreatedResponse;
  try {
    created = await submitWithRetry(apiUrl, tool, input, key, idempotencyKey);
  } catch (e) {
    if (e instanceof ApiError) {
      const code = exitCodeForApiError(e);
      if (asJson) emitError(true, e.message, code, e.status === 402 ? topUpUrl(apiUrl) : undefined, e.details);
      else console.error(describeApiError(e));
      return code;
    }
    throw e;
  }

  // Submit ledger row + submit JSON object (first ndjson line).
  appendJob({ ts: new Date().toISOString(), run_id: created.run_id, tool, status: "submit", output: [] });
  if (asJson) emit(created);
  console.error(`Run ${created.run_id} submitted (${created.credits_charged} credits). Polling…`);

  // Poll until terminal. In --json mode the terminal RunResponse is the second
  // ndjson line on stdout; otherwise output URLs alone go to stdout.
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
        emitError(asJson, `Run ${created.run_id} no longer exists (404).`, EXIT.GENERIC);
        return EXIT.GENERIC;
      }
      misses++;
      if (misses >= MAX_POLL_MISSES) {
        emitError(
          asJson,
          `Lost contact with the API (${MAX_POLL_MISSES} consecutive failures: ${(e as Error).message}). ` +
            `The run may still finish — check later with: agenthook list`,
          EXIT.GENERIC,
        );
        return EXIT.GENERIC;
      }
      continue;
    }
    if (runRow.status !== lastStatus) {
      console.error(`Status: ${runRow.status}`);
      lastStatus = runRow.status;
    }
    if (runRow.status === "completed") {
      appendJob({ ts: new Date().toISOString(), run_id: runRow.id, tool, status: "completed", output: runRow.output });
      if (asJson) emit(runRow);
      else for (const url of runRow.output) console.log(url);
      return EXIT.OK;
    }
    if (runRow.status === "failed") {
      appendJob({ ts: new Date().toISOString(), run_id: runRow.id, tool, status: "failed", output: [] });
      if (asJson) emit(runRow);
      else console.error(`Run failed: ${runRow.error ?? "unknown error"} (credits are refunded automatically)`);
      return EXIT.GENERIC;
    }
  }
  emitError(
    asJson,
    `Run ${created.run_id} did not finish within ${POLL_DEADLINE_MS / 60_000} minutes — ` +
      `giving up on polling. Check later with: agenthook list`,
    EXIT.GENERIC,
  );
  return EXIT.GENERIC;
}

/** Submit, retrying transient network failures with the SAME idempotency key. */
async function submitWithRetry(
  apiUrl: string,
  tool: string,
  input: Record<string, unknown>,
  key: string,
  idempotencyKey: string,
): Promise<RunCreatedResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<RunCreatedResponse>(apiUrl, `/tools/${encodeURIComponent(tool)}/run`, {
        method: "POST",
        key,
        body: input,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      });
    } catch (e) {
      // Only retry pure network/timeout failures (status 0); an HTTP error is
      // deterministic and re-sending won't change it.
      if (e instanceof ApiError && e.status === 0 && attempt < SUBMIT_RETRIES) continue;
      throw e;
    }
  }
}

/** Pull --api-url out of raw argv before the flag spec exists (spec derivation
 * needs the schema, fetched per api-url). Mirrors parseArgs' two forms; full
 * precedence (flag > env > file > default) is applied by resolveApiUrl. */
function preScanApiUrl(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--api-url") return argv[i + 1];
    if (a.startsWith("--api-url=")) return a.slice("--api-url=".length);
  }
  return undefined;
}

const topUpUrl = (apiUrl: string) => `${apiUrl}/credits`;

/** Machine JSON to stdout (one object per line, ndjson). */
function emit(obj: unknown): void {
  console.log(JSON.stringify(obj));
}

/** Human message to stderr, or a JSON error object to stdout under --json.
 * A server 400 carries a `details: [{path,message}]` array naming the offending
 * params — surfaced in the JSON so an agent needn't re-run without --json. */
function emitError(
  asJson: boolean,
  message: string,
  code: ExitCode,
  top_up_url?: string,
  details?: { path: string; message: string }[],
): void {
  if (asJson)
    console.log(
      JSON.stringify({
        error: message,
        exit_code: code,
        ...(details && details.length ? { details } : {}),
        ...(top_up_url ? { top_up_url } : {}),
      }),
    );
  else console.error(message);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
