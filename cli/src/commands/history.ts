import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT } from "../exit";
import { api } from "../http";
import { guardJson } from "../json-error";
import { table } from "../render";
import type { CreditsHistoryResponse } from "../types";

export async function history(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string", key: "string", json: "boolean" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const asJson = flags["json"] === true;
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  const key = resolveApiKey(flags["key"] as string | undefined);
  if (!key) {
    console.error("Not logged in — run `agenthook auth:login` first.");
    return EXIT.AUTH;
  }
  return guardJson(asJson, apiUrl, async () => {
    const res = await api<CreditsHistoryResponse>(apiUrl, "/credits/history", { key });
    if (asJson) {
      console.log(JSON.stringify(res));
      return EXIT.OK;
    }
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
    return EXIT.OK;
  });
}
