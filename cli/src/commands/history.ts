import { parseArgs } from "../args";
import { resolveApiUrl, storedApiKey } from "../config";
import { api } from "../http";
import { table } from "../render";
import type { CreditsHistoryResponse } from "../types";

export async function history(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return 1;
  }
  const key = storedApiKey();
  if (!key) {
    console.error("Not logged in — run `placeholder-name login` first.");
    return 1;
  }
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  const res = await api<CreditsHistoryResponse>(apiUrl, "/credits/history", { key });
  if (res.entries.length === 0) {
    console.log("No credit activity yet.");
  } else {
    const rows = res.entries.map((e) => [
      e.created_at,
      e.reason,
      e.delta > 0 ? `+${e.delta}` : String(e.delta),
      e.run_id ?? "-",
    ]);
    console.log(table(["CREATED", "REASON", "DELTA", "RUN"], rows));
  }
  console.log(`Balance: ${res.balance} credits`);
  return 0;
}
