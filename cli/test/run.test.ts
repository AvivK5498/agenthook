import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runCli } from "../src/cli";

// `run` resolves its schemas via resolveRunSchemas (live GET /v1/tools, cached,
// snapshot fallback). These tests exercise run's OWN logic — flag derivation,
// pre-validation, submit, poll — with the schema INJECTED as the real
// TOOLS_JSON_SCHEMA, so every "zero network before submit" assertion below is
// deterministic. (resolveRunSchemas' own fetch/cache/snapshot-fallback path is
// covered by the schemas + parity tests, not here.)
vi.mock("../src/schemas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/schemas")>();
  const { TOOLS_JSON_SCHEMA } = await import("../../core/contract");
  return { ...actual, resolveRunSchemas: async () => TOOLS_JSON_SCHEMA };
});

import {
  API,
  V1,
  json,
  runRow,
  seedCredentials,
  seedToolsCache,
  setupHarness,
  teardownHarness,
  TOOLS_JSON_SCHEMA,
  type Harness,
} from "./harness";

let h: Harness;
beforeEach(() => {
  h = setupHarness();
  seedCredentials(h.dir);
  seedToolsCache(h.dir);
});
afterEach(() => teardownHarness(h));

describe("run — deterministic pre-validation (no network)", () => {
  test("refs without --owns-references block locally with consent text; fetch never called", async () => {
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--ref", "https://a/1.jpg"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    const err = h.errs.join("\n");
    expect(err).toContain("--owns-references");
    expect(err).toContain("you attest that you own");
  });

  test("prompt over the forced model's cap blocks locally", async () => {
    const code = await runCli(["run", "make_video", "--model", "kling-3", "--prompt", "x".repeat(3000)]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("2500");
  });

  test("invalid enum blocks locally", async () => {
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--quality", "ultra"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("standard, pro");
  });

  test("--model nano-banana-2 without refs blocks locally", async () => {
    const code = await runCli(["run", "make_image", "--prompt", "hi", "--model", "nano-banana-2"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("edit model");
  });

  test("unknown tool blocks locally", async () => {
    const code = await runCli(["run", "make_ugc", "--prompt", "hi"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain('Unknown tool "make_ugc"');
  });

  test("not logged in → clear message, no network", async () => {
    seedCredentials(h.dir, ""); // empty key
    const code = await runCli(["run", "make_video", "--prompt", "hi"]);
    expect(code).toBe(2); // AUTH
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("login");
  });

  test("create_influencer without --name fails fast, exit 3, zero network", async () => {
    const code = await runCli(["run", "create_influencer", "--prompt", "an indie singer named Maya"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("create_influencer requires --name");
  });

  test("create_influencer with --name + --prompt submits (flags map to params)", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/create_influencer/run` && init?.method === "POST") {
        return json(202, { run_id: "inf_1", status: "queued", credits_charged: 20 });
      }
      if (url === `${V1}/runs/inf_1`) {
        return json(200, runRow({
          id: "inf_1",
          tool: "create_influencer",
          status: "completed",
          output: ["https://r2.example/portrait.png", "https://r2.example/sheet.png"],
        }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli([
      "run", "create_influencer", "--prompt", "an indie-pop singer", "--name", "Maya", "--slug", "maya",
    ]);
    expect(code).toBe(0);
    const post = h.fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      prompt: "an indie-pop singer",
      name: "Maya",
      slug: "maya",
    });
    expect(h.logs).toEqual([
      "https://r2.example/portrait.png",
      "https://r2.example/sheet.png",
    ]);
  });

  test("--influencer maps onto make_video params", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        return json(202, { run_id: "run_i", status: "queued", credits_charged: 25 });
      }
      if (url === `${V1}/runs/run_i`) {
        return json(200, runRow({ id: "run_i", status: "completed", output: ["https://r2.example/v.mp4"] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["run", "make_video", "--prompt", "talking about the launch", "--influencer", "maya"]);
    expect(code).toBe(0);
    const post = h.fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      prompt: "talking about the launch",
      influencer: "maya",
    });
  });
});

describe("run — cold cache (fresh install, no tools-cache.json): bundled snapshot, zero network", () => {
  // Same harness but WITHOUT seedToolsCache — the config dir has credentials
  // only, like a machine that just ran `npm i -g` + pasted a key. The default
  // fetchMock throws on any call, so these tests double as offline smokes.
  let cold: Harness;
  beforeEach(() => {
    teardownHarness(h); // replace the seeded-cache harness from the outer beforeEach
    cold = setupHarness();
    h = cold;
    seedCredentials(cold.dir);
  });

  test("refs without --owns-references block locally with the consent sentence; zero fetch", async () => {
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--ref", "https://a/1.jpg"]);
    expect(code).toBe(3); // VALIDATION
    expect(cold.fetchMock).not.toHaveBeenCalled();
    const err = cold.errs.join("\n");
    expect(err).toContain("--owns-references");
    expect(err).toContain("you attest that you own");
  });

  test("invalid enum blocks locally; zero fetch", async () => {
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--quality", "ultra"]);
    expect(code).toBe(3); // VALIDATION
    expect(cold.fetchMock).not.toHaveBeenCalled();
    expect(cold.errs.join("\n")).toContain("standard, pro");
  });

  test("unknown tool blocks locally; zero fetch", async () => {
    const code = await runCli(["run", "make_ugc", "--prompt", "hi"]);
    expect(code).toBe(3); // VALIDATION
    expect(cold.fetchMock).not.toHaveBeenCalled();
    expect(cold.errs.join("\n")).toContain('Unknown tool "make_ugc"');
  });

  test("prompt over the model cap blocks locally via the snapshot; zero fetch", async () => {
    const code = await runCli(["run", "make_video", "--model", "kling-3", "--prompt", "x".repeat(3000)]);
    expect(code).toBe(3); // VALIDATION
    expect(cold.fetchMock).not.toHaveBeenCalled();
    expect(cold.errs.join("\n")).toContain("2500");
  });

  test("valid input submits directly — no /tools schema fetch precedes the POST", async () => {
    cold.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        return json(202, { run_id: "run_c", status: "queued", credits_charged: 25 });
      }
      if (url === `${V1}/runs/run_c`) {
        return json(200, runRow({ id: "run_c", status: "completed", output: ["https://r2.example/c.mp4"] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["run", "make_video", "--prompt", "hi"]);
    expect(code).toBe(0);
    expect(cold.urls()[0]).toBe(`${V1}/tools/make_video/run`); // first network call is the submit itself
    expect(cold.urls()).not.toContain(`${V1}/tools`);
  });
});

describe("run — submit + poll", () => {
  test("polls every interval until completed, prints output URLs, exit 0", async () => {
    let polls = 0;
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        return json(202, { run_id: "run_1", status: "queued", credits_charged: 25 });
      }
      if (url === `${V1}/runs/run_1`) {
        polls++;
        if (polls < 3) return json(200, runRow({ status: "processing" }));
        return json(200, runRow({ status: "completed", output: ["https://r2.example/users/u/runs/run_1/0.mp4"] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const code = await runCli([
      "run", "make_video",
      "--prompt", "a person reads a script",
      "--quality", "pro",
      "--aspect-ratio", "9:16",
      "--captions",
      "--caption-style", "chunk",
    ]);
    expect(code).toBe(0);
    expect(polls).toBe(3);
    // output URL alone on stdout
    expect(h.logs).toEqual(["https://r2.example/users/u/runs/run_1/0.mp4"]);
    expect(h.errs.join("\n")).toContain("Run run_1 submitted (25 credits)");

    // the POST body carried exactly the passed flags
    const post = h.fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({
      prompt: "a person reads a script",
      quality: "pro",
      aspect_ratio: "9:16",
      captions: true,
      caption_style: "chunk",
    });
    // bearer auth on every call
    const headers = (post[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer pk_test");
  });

  test("failed run prints the error and exits 1", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") return json(202, { run_id: "run_9", status: "queued", credits_charged: 10 });
      if (url === `${V1}/runs/run_9`) {
        return json(200, runRow({ id: "run_9", status: "failed", error: "provider content moderation" }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["run", "make_video", "--prompt", "hi"]);
    expect(code).toBe(1);
    expect(h.logs).toEqual([]);
    expect(h.errs.join("\n")).toContain("provider content moderation");
    expect(h.errs.join("\n")).toContain("refunded");
  });

  test("server 402 (insufficient credits) is rendered, exit 1", async () => {
    h.fetchMock.mockImplementation(async () =>
      json(402, { error: "insufficient credits", code: "insufficient_credits" }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi"]);
    expect(code).toBe(4); // INSUFFICIENT_CREDITS
    expect(h.errs.join("\n")).toContain("insufficient credits");
    expect(h.errs.join("\n")).toContain("balance");
  });

  test("submit 400 under --json carries the validation details array", async () => {
    h.fetchMock.mockImplementation(async () =>
      json(400, {
        error: "validation failed",
        code: "validation_error",
        details: [{ path: "duration", message: "duration 7 not allowed for kling-3" }],
      }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--json"]);
    expect(code).toBe(3); // VALIDATION
    expect(JSON.parse(h.logs[0]!)).toEqual({
      error: "validation failed",
      exit_code: 3,
      details: [{ path: "duration", message: "duration 7 not allowed for kling-3" }],
    });
  });

  test("poll gives up after bounded consecutive failures", async () => {
    let calls = 0;
    h.fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return json(202, { run_id: "run_2", status: "queued", credits_charged: 5 });
      calls++;
      throw new Error("ECONNREFUSED");
    });
    const code = await runCli(["run", "make_video", "--prompt", "hi"]);
    expect(code).toBe(1);
    expect(calls).toBe(5); // MAX_POLL_MISSES
    expect(h.errs.join("\n")).toContain("Lost contact");
  });

  test("stale tools cache still validates locally — no schema refetch, zero network on rejection", async () => {
    // overwrite cache as stale (fetched 2h ago) — schemas change on deploy,
    // not per run; pre-validation must stay network-free (spec §3)
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.writeFileSync(
      path.join(h.dir, "tools-cache.json"),
      JSON.stringify({
        [API]: {
          fetched_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tools: TOOLS_JSON_SCHEMA,
        },
      }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--quality", "ultra"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe("run — --dry-run (free pre-flight)", () => {
  const dryBody = { dry_run: true, valid: true, model: "seedance-2", credits_required: 25 };

  test("sends dry_run:true, prints the price line, never polls, exit 0", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") return json(200, dryBody);
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--dry-run"]);
    expect(code).toBe(0);
    // exactly one network call — the dry-run POST, no /runs/:id poll
    expect(h.urls()).toEqual([`${V1}/tools/make_video/run`]);
    const post = h.fetchMock.mock.calls[0]!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ prompt: "hi", dry_run: true });
    expect(h.logs).toEqual(["Would cost 25 credits (model seedance-2). No credits charged."]);
  });

  test("--json emits the raw dry-run object on stdout, exit 0", async () => {
    h.fetchMock.mockImplementation(async () => json(200, dryBody));
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--dry-run", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(h.logs[0]!)).toEqual(dryBody);
  });

  test("local validation error still short-circuits with exit 3, zero network", async () => {
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--quality", "ultra", "--dry-run"]);
    expect(code).toBe(3); // VALIDATION — pre-flight never reaches the network
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.errs.join("\n")).toContain("standard, pro");
  });

  test("server 400 on a dry-run keeps exit 3", async () => {
    h.fetchMock.mockImplementation(async () =>
      json(400, { error: "bad request", code: "validation", details: [{ path: "duration", message: "too long" }] }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--dry-run"]);
    expect(code).toBe(3); // VALIDATION
    expect(h.errs.join("\n")).toContain("bad request");
  });

  test("server 400 under --json carries the validation details array (no re-run needed)", async () => {
    h.fetchMock.mockImplementation(async () =>
      json(400, {
        error: "validation failed",
        code: "validation_error",
        details: [{ path: "duration", message: "duration 7 not allowed for kling-3" }],
      }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--dry-run", "--json"]);
    expect(code).toBe(3); // VALIDATION
    expect(JSON.parse(h.logs[0]!)).toEqual({
      error: "validation failed",
      exit_code: 3,
      details: [{ path: "duration", message: "duration 7 not allowed for kling-3" }],
    });
  });

  test("server 402 on a dry-run surfaces credits exit + top-up url under --json", async () => {
    h.fetchMock.mockImplementation(async () =>
      json(402, { error: "insufficient credits", code: "insufficient_credits" }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--dry-run", "--json"]);
    expect(code).toBe(4); // INSUFFICIENT_CREDITS
    expect(JSON.parse(h.logs[0]!)).toMatchObject({ exit_code: 4, top_up_url: `${API}/credits` });
  });
});
