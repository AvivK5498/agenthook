import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../src/cli";
import {
  API,
  V1,
  json,
  runRow,
  seedCredentials,
  setupHarness,
  teardownHarness,
  TOOLS_JSON_SCHEMA,
  type Harness,
} from "./harness";

let h: Harness;
beforeEach(() => {
  h = setupHarness();
});
afterEach(() => teardownHarness(h));

describe("login", () => {
  test("--key verifies against /v1/me and stores credentials chmod 600", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${V1}/me`);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer pk_live_1");
      return json(200, { user_id: "u_1", balance: 30, suspended: false });
    });
    const code = await runCli(["login", "--key", "pk_live_1"]);
    expect(code).toBe(0);
    const p = path.join(h.dir, "credentials.json");
    expect(JSON.parse(fs.readFileSync(p, "utf8"))).toEqual({ api_key: "pk_live_1" });
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
    expect(h.logs.join("\n")).toContain("balance: 30 credits");
  });

  test("rejected key (401) saves nothing, exit 1", async () => {
    h.fetchMock.mockImplementation(async () => json(401, { error: "invalid api key" }));
    const code = await runCli(["login", "--key", "bad"]);
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(h.dir, "credentials.json"))).toBe(false);
    expect(h.errs.join("\n")).toContain("rejected");
  });

  test("--api-url is persisted and used for the verify call", async () => {
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe("https://api.example.com/api/v1/me");
      return json(200, { user_id: "u_1", balance: 5, suspended: false });
    });
    const code = await runCli(["login", "--key", "k", "--api-url", "https://api.example.com"]);
    expect(code).toBe(0);
    const creds = JSON.parse(fs.readFileSync(path.join(h.dir, "credentials.json"), "utf8"));
    expect(creds.api_url).toBe("https://api.example.com");
  });

  test("AGENTHOOK_API_URL env wins over the default", async () => {
    process.env.AGENTHOOK_API_URL = "https://env.example.com";
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe("https://env.example.com/api/v1/me");
      return json(200, { user_id: "u", balance: 1, suspended: false });
    });
    expect(await runCli(["login", "--key", "k"])).toBe(0);
    delete process.env.AGENTHOOK_API_URL;
  });
});

describe("tools", () => {
  test("fetches GET /v1/tools, prints every tool, and warms the cache", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe(`${V1}/tools`);
      return json(200, { tools: TOOLS_JSON_SCHEMA });
    });
    const code = await runCli(["tools"]);
    expect(code).toBe(0);
    const out = h.logs.join("\n");
    expect(out).toContain("make_video");
    expect(out).toContain("make_image");
    expect(out).toContain("caption_video");
    expect(out).toContain("create_influencer");
    expect(out).toContain("--owns-references");
    const cache = JSON.parse(fs.readFileSync(path.join(h.dir, "tools-cache.json"), "utf8"));
    expect(cache[API].tools).toHaveLength(4);
  });
});

describe("list", () => {
  test("passes --tool/--status/--search as query params and renders a table", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/generations");
      expect(url.searchParams.get("tool")).toBe("make_video");
      expect(url.searchParams.get("status")).toBe("completed");
      expect(url.searchParams.get("q")).toBe("pirate ship");
      return json(200, {
        runs: [runRow({ status: "completed", output: ["https://r2.example/v.mp4"] })],
        next_cursor: null,
      });
    });
    const code = await runCli([
      "list", "--tool", "make_video", "--status", "completed", "--search", "pirate ship",
    ]);
    expect(code).toBe(0);
    const out = h.logs.join("\n");
    expect(out).toContain("ID");
    expect(out).toContain("run_1");
    expect(out).toContain("https://r2.example/v.mp4");
  });

  test("empty result says so", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { runs: [], next_cursor: null }));
    expect(await runCli(["list"])).toBe(0);
    expect(h.logs.join("\n")).toContain("No generations found.");
  });
});

describe("influencers", () => {
  const maya = {
    slug: "maya",
    name: "Maya",
    portrait_url: "https://r2.example/maya/portrait.png",
    sheet_url: "https://r2.example/maya/sheet.png",
    appearance: "warm-toned indie-pop singer, mid-20s",
    created_at: "2026-07-11T09:00:00Z",
    run_id: "inf_1",
  };

  test("lists roster as slug / name / portrait lines", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe(`${V1}/influencers`);
      return json(200, { influencers: [maya] });
    });
    expect(await runCli(["influencers"])).toBe(0);
    const out = h.logs.join("\n");
    expect(out).toContain("SLUG");
    expect(out).toContain("maya");
    expect(out).toContain("Maya");
    expect(out).toContain("https://r2.example/maya/portrait.png");
  });

  test("empty roster says so", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { influencers: [] }));
    expect(await runCli(["influencers"])).toBe(0);
    expect(h.logs.join("\n")).toContain("No influencers yet");
  });

  test("--json emits the raw list object on stdout", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { influencers: [maya] }));
    expect(await runCli(["influencers", "--json"])).toBe(0);
    expect(JSON.parse(h.logs[0]!)).toEqual({ influencers: [maya] });
  });

  test("401 → login hint, exit 2 (AUTH)", async () => {
    seedCredentials(h.dir, "revoked");
    h.fetchMock.mockImplementation(async () => json(401, { error: "invalid api key" }));
    expect(await runCli(["influencers"])).toBe(2);
    expect(h.errs.join("\n")).toContain("agenthook login");
  });

  test("delete <slug> hits DELETE /v1/influencers/:slug and confirms", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      expect(String(input)).toBe(`${V1}/influencers/maya`);
      expect(init?.method).toBe("DELETE");
      return json(200, { deleted: true });
    });
    expect(await runCli(["influencers:delete", "maya"])).toBe(0);
    expect(h.logs.join("\n")).toBe("Deleted maya.");
  });

  test("delete --json emits {deleted:true}", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { deleted: true }));
    expect(await runCli(["influencers:delete", "maya", "--json"])).toBe(0);
    expect(JSON.parse(h.logs[0]!)).toEqual({ deleted: true });
  });

  test("delete unknown slug → 404 with a slug-named message, exit 1", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(404, { error: "not found" }));
    expect(await runCli(["influencers:delete", "ghost"])).toBe(1);
    expect(h.errs.join("\n")).toContain('No influencer with slug "ghost".');
  });

  test("delete 401 → exit 2 (AUTH)", async () => {
    seedCredentials(h.dir, "revoked");
    h.fetchMock.mockImplementation(async () => json(401, { error: "invalid api key" }));
    expect(await runCli(["influencers:delete", "maya"])).toBe(2);
  });

  test("delete without a slug prints usage, exit 1", async () => {
    seedCredentials(h.dir);
    expect(await runCli(["influencers:delete"])).toBe(1);
    expect(h.errs.join("\n")).toContain("Usage: agenthook influencers:delete <slug>");
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe("balance", () => {
  test("prints balance from /v1/me", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe(`${V1}/me`);
      return json(200, { user_id: "u_1", balance: 42, suspended: false });
    });
    expect(await runCli(["balance"])).toBe(0);
    expect(h.logs.join("\n")).toContain("Balance: 42 credits");
  });

  test("suspended account is surfaced", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { user_id: "u_1", balance: 0, suspended: true }));
    expect(await runCli(["balance"])).toBe(0);
    expect(h.errs.join("\n")).toContain("suspended");
  });

  test("401 renders a login hint, exit 2 (AUTH)", async () => {
    seedCredentials(h.dir, "revoked");
    h.fetchMock.mockImplementation(async () => json(401, { error: "invalid api key" }));
    expect(await runCli(["balance"])).toBe(2);
    expect(h.errs.join("\n")).toContain("agenthook login");
  });
});

describe("history", () => {
  test("renders the ledger table + balance", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown) => {
      expect(String(input)).toBe(`${V1}/credits/history`);
      return json(200, {
        entries: [
          { id: "l1", run_id: null, delta: 30, reason: "grant", created_at: "2026-07-10T09:00:00Z" },
          { id: "l2", run_id: "run_1", delta: -25, reason: "debit", created_at: "2026-07-10T10:00:00Z" },
          { id: "l3", run_id: "run_1", delta: 25, reason: "refund", created_at: "2026-07-10T10:05:00Z" },
        ],
        balance: 30,
        next_cursor: null,
      });
    });
    expect(await runCli(["history"])).toBe(0);
    const out = h.logs.join("\n");
    expect(out).toContain("grant");
    expect(out).toContain("+30");
    expect(out).toContain("-25");
    expect(out).toContain("Balance: 30 credits");
  });
});

describe("dispatcher", () => {
  test("unknown command prints usage, exit 1", async () => {
    expect(await runCli(["frobnicate"])).toBe(1);
    expect(h.errs.join("\n")).toContain('Unknown command "frobnicate"');
  });

  test("help exits 0 with usage", async () => {
    expect(await runCli(["--help"])).toBe(0);
    expect(h.logs.join("\n")).toContain("Usage: agenthook");
  });
});
