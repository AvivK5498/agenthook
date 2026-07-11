import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT } from "../exit";
import { api } from "../http";
import { guardJson } from "../json-error";
import { table, truncate } from "../render";
import type { GenerationsResponse } from "../types";

export async function list(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, {
    "api-url": "string",
    key: "string",
    json: "boolean",
    tool: "string",
    status: "string",
    search: "string",
  });
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
    const res = await api<GenerationsResponse>(apiUrl, "/generations", {
      key,
      query: {
        tool: flags["tool"] as string | undefined,
        status: flags["status"] as string | undefined,
        q: flags["search"] as string | undefined,
      },
    });
    if (asJson) {
      console.log(JSON.stringify(res));
      return EXIT.OK;
    }
    if (res.runs.length === 0) {
      console.log("No generations found.");
      return EXIT.OK;
    }
    const rows = res.runs.map((r) => [
      r.id,
      r.tool,
      r.status,
      r.created_at,
      String(r.credits_charged),
      r.output[0] ?? (r.error ? truncate(r.error, 40) : truncate(r.prompt ?? "", 40)),
    ]);
    console.log(table(["ID", "TOOL", "STATUS", "CREATED", "CREDITS", "OUTPUT"], rows));
    if (res.next_cursor) console.error("(more results available — narrow with --tool/--status/--search)");
    return EXIT.OK;
  });
}
