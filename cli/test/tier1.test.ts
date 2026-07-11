// CLI Tier-1 conventions (spec AC4/AC6/AC7 + §5 exit codes): env-var key
// precedence, --json shapes, frozen exit codes, idempotency-key reuse, and the
// local jobs ledger. All fetches mocked; no network.
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
  seedToolsCache,
  setupHarness,
  teardownHarness,
  type Harness,
} from "./harness";

let h: Harness;
beforeEach(() => {
  h = setupHarness();
});
afterEach(() => teardownHarness(h));

const bearerOf = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.authorization;

describe("AGENTHOOK_API_KEY precedence (flag > env > file)", () => {
  test("env var authenticates when no credentials file exists", async () => {
    process.env.AGENTHOOK_API_KEY = "pk_env";
    h.fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      expect(bearerOf(init)).toBe("Bearer pk_env");
      return json(200, { user_id: "u", balance: 7, suspended: false });
    });
    expect(await runCli(["balance"])).toBe(0);
  });

  test("env var wins over the credentials file", async () => {
    seedCredentials(h.dir, "pk_file");
    process.env.AGENTHOOK_API_KEY = "pk_env";
    h.fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      expect(bearerOf(init)).toBe("Bearer pk_env");
      return json(200, { user_id: "u", balance: 1, suspended: false });
    });
    expect(await runCli(["balance"])).toBe(0);
  });

  test("--key flag wins over both env and file", async () => {
    seedCredentials(h.dir, "pk_file");
    process.env.AGENTHOOK_API_KEY = "pk_env";
    h.fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      expect(bearerOf(init)).toBe("Bearer pk_flag");
      return json(200, { user_id: "u", balance: 1, suspended: false });
    });
    expect(await runCli(["balance", "--key", "pk_flag"])).toBe(0);
  });
});

describe("--json shapes", () => {
  test("balance --json prints the raw MeResponse on stdout, nothing else", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () => json(200, { user_id: "u_9", balance: 12, suspended: false }));
    expect(await runCli(["balance", "--json"])).toBe(0);
    expect(h.logs).toHaveLength(1);
    expect(JSON.parse(h.logs[0]!)).toEqual({ user_id: "u_9", balance: 12, suspended: false });
  });

  test("list --json prints the raw GenerationsResponse", async () => {
    seedCredentials(h.dir);
    const payload = { runs: [runRow({ status: "completed", output: ["https://r2/x.mp4"] })], next_cursor: null };
    h.fetchMock.mockImplementation(async () => json(200, payload));
    expect(await runCli(["list", "--json"])).toBe(0);
    expect(JSON.parse(h.logs[0]!)).toEqual(payload);
  });

  test("run --json emits the submit object then the terminal result (ndjson, stdout only)", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        return json(202, { run_id: "run_j", status: "queued", credits_charged: 25 });
      }
      if (url === `${V1}/runs/run_j`) {
        return json(200, runRow({ id: "run_j", status: "completed", output: ["https://r2/j.mp4"] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--json"]);
    expect(code).toBe(0);
    // two ndjson lines on stdout: submit, then terminal RunResponse
    expect(h.logs).toHaveLength(2);
    expect(JSON.parse(h.logs[0]!)).toEqual({ run_id: "run_j", status: "queued", credits_charged: 25 });
    expect(JSON.parse(h.logs[1]!).id).toBe("run_j");
    expect(JSON.parse(h.logs[1]!).output).toEqual(["https://r2/j.mp4"]);
    // human progress went to stderr
    expect(h.errs.join("\n")).toContain("submitted");
  });

  test("run --json on 402 emits an error payload with exit_code 4 + top_up_url, exit 4", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    h.fetchMock.mockImplementation(async () =>
      json(402, { error: "insufficient credits", code: "insufficient_credits" }),
    );
    const code = await runCli(["run", "make_video", "--prompt", "hi", "--json"]);
    expect(code).toBe(4);
    const payload = JSON.parse(h.logs[0]!);
    expect(payload.exit_code).toBe(4);
    expect(payload.top_up_url).toBe(`${API}/credits`);
  });

  test("balance --json on 402 carries top_up_url", async () => {
    seedCredentials(h.dir);
    h.fetchMock.mockImplementation(async () =>
      json(402, { error: "insufficient credits", code: "insufficient_credits" }),
    );
    const code = await runCli(["balance", "--json"]);
    expect(code).toBe(4);
    const payload = JSON.parse(h.logs[0]!);
    expect(payload.exit_code).toBe(4);
    expect(payload.top_up_url).toBe(`${API}/credits`);
  });
});

describe("Idempotency-Key on run submit", () => {
  test("submit carries a UUID Idempotency-Key header", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    let key: string | undefined;
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        key = (init.headers as Record<string, string>)["Idempotency-Key"];
        return json(202, { run_id: "run_i", status: "queued", credits_charged: 5 });
      }
      if (url === `${V1}/runs/run_i`) return json(200, runRow({ id: "run_i", status: "completed", output: ["u"] }));
      throw new Error(`unexpected fetch ${url}`);
    });
    expect(await runCli(["run", "make_video", "--prompt", "hi"])).toBe(0);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("a transient network failure re-submits with the SAME idempotency key", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    const keys: string[] = [];
    let submits = 0;
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
        submits++;
        if (submits === 1) throw new Error("ECONNRESET"); // transient → retried
        return json(202, { run_id: "run_k", status: "queued", credits_charged: 5 });
      }
      if (url === `${V1}/runs/run_k`) return json(200, runRow({ id: "run_k", status: "completed", output: ["u"] }));
      throw new Error(`unexpected fetch ${url}`);
    });
    expect(await runCli(["run", "make_video", "--prompt", "hi"])).toBe(0);
    expect(submits).toBe(2);
    expect(keys[0]).toBe(keys[1]); // same key reused on retry (no double-charge)
  });

  test("a deterministic HTTP error is NOT retried", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    let submits = 0;
    h.fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        submits++;
        return json(400, { error: "bad", code: "validation_error" });
      }
      throw new Error("unexpected");
    });
    expect(await runCli(["run", "make_video", "--prompt", "hi"])).toBe(3); // VALIDATION
    expect(submits).toBe(1); // no retry on a 4xx
  });
});

describe("jobs ledger", () => {
  test("run appends submit + terminal rows to jobs.jsonl", async () => {
    seedCredentials(h.dir);
    seedToolsCache(h.dir);
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${V1}/tools/make_video/run` && init?.method === "POST") {
        return json(202, { run_id: "run_led", status: "queued", credits_charged: 25 });
      }
      if (url === `${V1}/runs/run_led`) {
        return json(200, runRow({ id: "run_led", status: "completed", output: ["https://r2/led.mp4"] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    expect(await runCli(["run", "make_video", "--prompt", "hi"])).toBe(0);
    const lines = fs
      .readFileSync(path.join(h.dir, "jobs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ run_id: "run_led", tool: "make_video", status: "submit" });
    expect(lines[1]).toMatchObject({ run_id: "run_led", status: "completed", output: ["https://r2/led.mp4"] });
  });

  test("jobs lists the ledger; --json emits one object per line", async () => {
    fs.mkdirSync(h.dir, { recursive: true });
    fs.writeFileSync(
      path.join(h.dir, "jobs.jsonl"),
      JSON.stringify({ ts: "t1", run_id: "r1", tool: "make_video", status: "submit", output: [] }) +
        "\n" +
        JSON.stringify({ ts: "t2", run_id: "r1", tool: "make_video", status: "completed", output: ["https://r2/r1.mp4"] }) +
        "\n",
    );
    expect(await runCli(["jobs"])).toBe(0);
    const human = h.logs.join("\n");
    expect(human).toContain("r1");
    expect(human).toContain("completed");

    h.logs.length = 0;
    expect(await runCli(["jobs", "--json"])).toBe(0);
    expect(h.logs).toHaveLength(2);
    expect(JSON.parse(h.logs[1]!).output).toEqual(["https://r2/r1.mp4"]);
  });

  test("jobs on an empty ledger says so, exit 0, no network", async () => {
    expect(await runCli(["jobs"])).toBe(0);
    expect(h.logs.join("\n")).toContain("No jobs recorded yet.");
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});
