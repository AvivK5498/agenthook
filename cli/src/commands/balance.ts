import { parseArgs } from "../args";
import { resolveApiUrl, storedApiKey } from "../config";
import { api } from "../http";
import type { MeResponse } from "../types";

export async function balance(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return 1;
  }
  const key = storedApiKey();
  if (!key) {
    console.error("Not logged in — run `agenthook login` first.");
    return 1;
  }
  const me = await api<MeResponse>(resolveApiUrl(flags["api-url"] as string | undefined), "/me", { key });
  console.log(`User:    ${me.user_id}`);
  console.log(`Balance: ${me.balance} credits`);
  if (me.suspended) console.error("Account suspended — new runs are refused.");
  return 0;
}
