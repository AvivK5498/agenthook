// Local jobs ledger — append-only NDJSON at <config-dir>/jobs.jsonl. `run`
// appends one line on submit and one on the terminal result; `jobs` reads it
// back. Best-effort: a ledger write must never crash a run (spec — the ledger
// is a convenience, not the source of truth; the server owns run state).
import * as fs from "node:fs";
import { configDir, jobsPath } from "./config";

export interface JobEntry {
  ts: string; // ISO timestamp of this event
  run_id: string;
  tool: string;
  status: string; // submit | queued | processing | completed | failed | …
  output: string[]; // output URLs on a terminal completed row; [] otherwise
}

/** Append one ledger line. Swallows IO errors — never fails the caller. */
export function appendJob(entry: JobEntry): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    fs.appendFileSync(jobsPath(), JSON.stringify(entry) + "\n");
  } catch {
    // ledger is best-effort; the run already succeeded/failed on its own terms
  }
}

/** Read every ledger line, newest last. Skips malformed lines defensively. */
export function readJobs(): JobEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(jobsPath(), "utf8");
  } catch {
    return [];
  }
  const out: JobEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JobEntry);
    } catch {
      // tolerate a partially-written trailing line
    }
  }
  return out;
}
