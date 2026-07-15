// Tool-schema source. GET /v1/tools is the single live schema source, and
// `run` DERIVES its flags from it (a new API param is a usable flag with no CLI
// upgrade) via resolveRunSchemas: the cached fetch when fresh, a live keyless
// fetch on miss (public endpoint), and the bundled snapshot as the offline
// fallback — so it stays current online and still works offline. (This relaxes
// the original spec §3 "no network before submit" guarantee to a cached,
// at-most-hourly, keyless fetch — the cost of never-stale flags.)
import * as fs from "node:fs";
import * as path from "node:path";
import { configDir } from "./config";
import { api } from "./http";
import { TOOLS_SNAPSHOT } from "./schema-snapshot";
import type { ToolSchema, ToolsResponse } from "./types";

export const TOOLS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — schemas change on deploy, not per run

interface ToolsCache {
  [apiUrl: string]: { fetched_at: string; tools: ToolSchema[] };
}

export function toolsCachePath(): string {
  return path.join(configDir(), "tools-cache.json");
}

function readCache(): ToolsCache {
  try {
    return JSON.parse(fs.readFileSync(toolsCachePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache: ToolsCache): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(toolsCachePath(), JSON.stringify(cache, null, 2) + "\n");
}

/** Local-only schema resolution for `run` pre-validation — NEVER touches the
 * network (spec §3: block locally before any network call, first invocation
 * included). Order: any cached fetch of this api-url (fresh or stale — schemas
 * change on deploy, not per run) → the bundled snapshot. The server re-checks
 * everything authoritatively, so a stale local view only changes where a bad
 * request is rejected, never whether. */
export function getLocalToolSchemas(apiUrl: string): ToolSchema[] {
  return readCache()[apiUrl]?.tools ?? TOOLS_SNAPSHOT;
}

/** Schema source for `run`'s flag derivation + pre-validation. Live-and-cached
 * (GET /v1/tools is PUBLIC — no key) so a new tool param becomes a usable flag
 * without a CLI upgrade; falls back to the last cache, then the bundled
 * snapshot, so it never throws (offline / fresh install still work). The server
 * re-validates authoritatively on submit. */
export async function resolveRunSchemas(apiUrl: string): Promise<ToolSchema[]> {
  try {
    return await getToolSchemas(apiUrl);
  } catch {
    return getLocalToolSchemas(apiUrl);
  }
}

/** Cached-first schema load. `fresh: true` (the `tools` command) always
 * refetches; otherwise a fresh cache entry short-circuits the network, and a
 * stale one is the fallback when the API is unreachable (the server re-checks
 * everything authoritatively anyway). */
export async function getToolSchemas(
  apiUrl: string,
  key?: string,
  opts: { fresh?: boolean } = {},
): Promise<ToolSchema[]> {
  const cache = readCache();
  const hit = cache[apiUrl];
  if (!opts.fresh && hit && Date.now() - Date.parse(hit.fetched_at) < TOOLS_CACHE_TTL_MS) {
    return hit.tools;
  }
  try {
    const res = await api<ToolsResponse>(apiUrl, "/tools", { key });
    cache[apiUrl] = { fetched_at: new Date().toISOString(), tools: res.tools };
    writeCache(cache);
    return res.tools;
  } catch (e) {
    if (hit) return hit.tools;
    throw e;
  }
}
