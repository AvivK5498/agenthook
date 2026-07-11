import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const BASE_PATH = "/api/v1";
export const DEFAULT_API_URL = "https://getagenthook.com";

/** Config home — overridable for tests via AGENTHOOK_CONFIG_DIR. */
export function configDir(): string {
  return process.env.AGENTHOOK_CONFIG_DIR || path.join(os.homedir(), ".agenthook");
}

export function credentialsPath(): string {
  return path.join(configDir(), "credentials.json");
}

/** Local jobs ledger — one JSON line per run submit + terminal event. */
export function jobsPath(): string {
  return path.join(configDir(), "jobs.jsonl");
}

export interface Credentials {
  api_key?: string;
  api_url?: string;
}

export function loadCredentials(): Credentials {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Writes credentials with owner-only permissions (dir 700, file 600). */
export function saveCredentials(creds: Credentials): string {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const p = credentialsPath();
  fs.writeFileSync(p, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(p, 0o600); // writeFileSync's mode is ignored when the file already exists
  return p;
}

/** Resolution order: --api-url flag > AGENTHOOK_API_URL > stored > default. */
export function resolveApiUrl(flagValue?: string): string {
  const url =
    flagValue || process.env.AGENTHOOK_API_URL || loadCredentials().api_url || DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

/** File-only key (used by `login` to display "already stored"; commands use resolveApiKey). */
export function storedApiKey(): string | undefined {
  return loadCredentials().api_key;
}

/** Resolution order: --key flag > AGENTHOOK_API_KEY env > credentials file. */
export function resolveApiKey(flagValue?: string): string | undefined {
  return flagValue || process.env.AGENTHOOK_API_KEY || loadCredentials().api_key;
}
