import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT } from "../exit";
import { api, ApiError } from "../http";
import { guardJson } from "../json-error";
import { table } from "../render";
import type { InfluencersListResponse } from "../types";

const AUTH_FLAGS = { "api-url": "string", key: "string", json: "boolean" } as const;

/** `agenthook influencers` — GET /v1/influencers, the account's roster. */
export async function influencers(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { ...AUTH_FLAGS });
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
    const res = await api<InfluencersListResponse>(apiUrl, "/influencers", { key });
    if (asJson) {
      console.log(JSON.stringify(res));
      return EXIT.OK;
    }
    if (res.influencers.length === 0) {
      console.log("No influencers yet — create one with `agenthook run create_influencer`.");
      return EXIT.OK;
    }
    const rows = res.influencers.map((i) => [i.slug, i.name, i.portrait_url]);
    console.log(table(["SLUG", "NAME", "PORTRAIT"], rows));
    return EXIT.OK;
  });
}

/** `agenthook influencers:delete <slug>` — DELETE /v1/influencers/:slug. */
export async function influencersDelete(argv: string[]): Promise<number> {
  const { positionals, flags, errors } = parseArgs(argv, { ...AUTH_FLAGS });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const asJson = flags["json"] === true;
  const slug = positionals[0];
  if (!slug) {
    console.error("Usage: agenthook influencers:delete <slug>");
    return EXIT.GENERIC;
  }
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  const key = resolveApiKey(flags["key"] as string | undefined);
  if (!key) {
    console.error("Not logged in — run `agenthook auth:login` first.");
    return EXIT.AUTH;
  }
  try {
    await api<{ deleted: true }>(apiUrl, `/influencers/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      key,
    });
  } catch (e) {
    // A 404 gets a clear, slug-named message; every other ApiError maps through
    // the frozen taxonomy (401/403 → AUTH exit 2) via guardJson's re-emission.
    if (e instanceof ApiError && e.status === 404) {
      if (asJson) console.log(JSON.stringify({ error: `No influencer with slug "${slug}".`, exit_code: EXIT.GENERIC }));
      else console.error(`No influencer with slug "${slug}".`);
      return EXIT.GENERIC;
    }
    return guardJson(asJson, apiUrl, async () => {
      throw e;
    });
  }
  if (asJson) console.log(JSON.stringify({ deleted: true }));
  else console.log(`Deleted ${slug}.`);
  return EXIT.OK;
}
