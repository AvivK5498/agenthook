import * as readline from "node:readline/promises";
import { parseArgs } from "../args";
import { loadCredentials, resolveApiUrl, saveCredentials } from "../config";
import { api, ApiError } from "../http";
import type { MeResponse } from "../types";

export async function login(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { key: "string", "api-url": "string" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return 1;
  }
  let key = flags["key"] as string | undefined;
  if (!key) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    key = (await rl.question("API key: ")).trim();
    rl.close();
  }
  if (!key) {
    console.error("No API key provided.");
    return 1;
  }

  const apiUrlFlag = flags["api-url"] as string | undefined;
  const apiUrl = resolveApiUrl(apiUrlFlag);
  const creds = {
    ...loadCredentials(),
    api_key: key,
    ...(apiUrlFlag ? { api_url: apiUrl } : {}),
  };

  try {
    const me = await api<MeResponse>(apiUrl, "/me", { key });
    const p = saveCredentials(creds);
    console.log(`Logged in as ${me.user_id} (balance: ${me.balance} credits).`);
    console.log(`Credentials saved to ${p}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      console.error(`That API key was rejected by ${apiUrl} — nothing saved.`);
      return 1;
    }
    // API unreachable: save anyway (key may be fine), but say so.
    const p = saveCredentials(creds);
    console.error(`Could not verify the key against ${apiUrl} (${(e as Error).message}).`);
    console.error(`Saved to ${p} anyway — verify later with \`placeholder-name balance\`.`);
    return 0;
  }
}
