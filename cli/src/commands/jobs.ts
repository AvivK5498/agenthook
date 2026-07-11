import { parseArgs } from "../args";
import { EXIT } from "../exit";
import { readJobs } from "../jobs";
import { table, truncate } from "../render";

// Reads the local jobs ledger (<config-dir>/jobs.jsonl) — the CLI's own record
// of every submit + terminal event. Offline, no network, no key needed.
export async function jobs(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { json: "boolean" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const entries = readJobs();
  if (flags["json"] === true) {
    for (const e of entries) console.log(JSON.stringify(e));
    return EXIT.OK;
  }
  if (entries.length === 0) {
    console.log("No jobs recorded yet.");
    return EXIT.OK;
  }
  const rows = entries.map((e) => [
    e.ts,
    e.run_id,
    e.tool,
    e.status,
    truncate(e.output[0] ?? "", 48),
  ]);
  console.log(table(["TS", "RUN", "TOOL", "STATUS", "OUTPUT"], rows));
  return EXIT.OK;
}
