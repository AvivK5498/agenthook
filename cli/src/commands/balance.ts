import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT } from "../exit";
import { api } from "../http";
import { guardJson } from "../json-error";
import type { MeResponse } from "../types";

export async function balance(argv: string[]): Promise<number> {
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
    const me = await api<MeResponse>(apiUrl, "/me", { key });
    if (asJson) {
      console.log(JSON.stringify(me));
    } else {
      console.log(`User:    ${me.user_id}`);
      console.log(`Balance: ${me.balance} credits`);
      if (me.suspended) console.error("Account suspended — new runs are refused.");
    }
    return EXIT.OK;
  });
}
