import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { resolveApiUrl, VERSION } from "../src/client.js";

// The User-Agent (agenthook-mcp/<VERSION>) must track the published version so
// PostHog attribution reports the real client version, not a stale literal.
describe("VERSION", () => {
  it("matches package.json", () => {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});

// Guards the security fix (review finding A1): AGENTHOOK_API_URL must be https,
// so a hostile/misconfigured env can't redirect the Bearer key to a cleartext
// or attacker-controlled host. http:// is allowed only for localhost.
describe("resolveApiUrl — https enforcement", () => {
  const orig = process.env.AGENTHOOK_API_URL;
  afterEach(() => {
    if (orig === undefined) delete process.env.AGENTHOOK_API_URL;
    else process.env.AGENTHOOK_API_URL = orig;
  });

  it("defaults to the https production URL when unset", () => {
    delete process.env.AGENTHOOK_API_URL;
    expect(resolveApiUrl()).toBe("https://getagenthook.com");
  });

  it("accepts an https override and strips trailing slashes", () => {
    process.env.AGENTHOOK_API_URL = "https://staging.getagenthook.com/";
    expect(resolveApiUrl()).toBe("https://staging.getagenthook.com");
  });

  it("rejects a cleartext http host (the key-exfil vector)", () => {
    process.env.AGENTHOOK_API_URL = "http://evil.example";
    expect(() => resolveApiUrl()).toThrow(/https/);
  });

  it("allows http only for localhost (dev)", () => {
    process.env.AGENTHOOK_API_URL = "http://localhost:3000";
    expect(resolveApiUrl()).toBe("http://localhost:3000");
    process.env.AGENTHOOK_API_URL = "http://127.0.0.1:3000";
    expect(resolveApiUrl()).toBe("http://127.0.0.1:3000");
  });

  it("rejects a malformed URL", () => {
    process.env.AGENTHOOK_API_URL = "not a url";
    expect(() => resolveApiUrl()).toThrow(/valid URL/);
  });
});
