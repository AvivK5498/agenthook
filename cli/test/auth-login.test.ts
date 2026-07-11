// Device auth flow (spec AC1/AC5). All fetches mocked — no network. The poll
// interval is 1ms in the harness so multi-poll sequences run instantly.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../src/cli";
import { API, V1, json, setupHarness, teardownHarness, type Harness } from "./harness";

let h: Harness;
beforeEach(() => {
  h = setupHarness();
});
afterEach(() => teardownHarness(h));

const CREATE = `${V1}/device`;
const poll = (tok: string) => `${V1}/device/${tok}`;

describe("auth:login — device flow", () => {
  test("prints the approved shape, polls until approved, saves the key chmod 600, exit 0", async () => {
    let polls = 0;
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === CREATE && init?.method === "POST") {
        // requesting_host = os.hostname()
        expect(JSON.parse(init.body as string)).toEqual({ requesting_host: os.hostname() });
        return json(201, {
          device_url: `${API}/activate`,
          user_code: "ABC-XYZ",
          poll_token: "tok_1",
          expires_in: 900,
        });
      }
      if (url === poll("tok_1")) {
        polls++;
        if (polls < 3) return json(200, { status: "pending" });
        return json(200, { status: "approved", api_key: "pk_minted", email: "a@b.com" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const code = await runCli(["auth:login"]);
    expect(code).toBe(0);
    expect(polls).toBe(3);

    const out = h.logs.join("\n");
    // exact approved output shape (AC1)
    expect(out).toContain("To authorize this agent, ask your human to visit:");
    expect(out).toContain(`    ${API}/activate`);
    expect(out).toContain("    and enter code:  ABC-XYZ");
    expect(out).toContain("Waiting for approval… (expires in 15m)");
    expect(out).toContain("✓ Authorized as a@b.com");

    const p = path.join(h.dir, "credentials.json");
    expect(JSON.parse(fs.readFileSync(p, "utf8")).api_key).toBe("pk_minted");
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
    expect(out).toContain(`Key saved to ${p}`);
  });

  test("expired session → message + exit 2, nothing saved", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === CREATE && init?.method === "POST") {
        return json(201, { device_url: `${API}/activate`, user_code: "AAA-BBB", poll_token: "tok_e", expires_in: 900 });
      }
      if (url === poll("tok_e")) return json(200, { status: "expired" });
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["auth:login"]);
    expect(code).toBe(2);
    expect(h.errs.join("\n")).toContain("expired");
    expect(fs.existsSync(path.join(h.dir, "credentials.json"))).toBe(false);
  });

  test("already-claimed session → message + exit 2", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === CREATE && init?.method === "POST") {
        return json(201, { device_url: `${API}/activate`, user_code: "CCC-DDD", poll_token: "tok_c", expires_in: 900 });
      }
      if (url === poll("tok_c")) return json(200, { status: "claimed" });
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["auth:login"]);
    expect(code).toBe(2);
    expect(h.errs.join("\n")).toContain("already used");
  });

  test("keyless `login` (no --key) falls through to the device flow", async () => {
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === CREATE && init?.method === "POST") {
        return json(201, { device_url: `${API}/activate`, user_code: "EEE-FFF", poll_token: "tok_l", expires_in: 900 });
      }
      if (url === poll("tok_l")) return json(200, { status: "approved", api_key: "pk_via_login", email: "c@d.com" });
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["login"]);
    expect(code).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(h.dir, "credentials.json"), "utf8")).api_key).toBe("pk_via_login");
  });

  test("transient poll network error is retried until a terminal state", async () => {
    let polls = 0;
    h.fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === CREATE && init?.method === "POST") {
        return json(201, { device_url: `${API}/activate`, user_code: "GGG-HHH", poll_token: "tok_r", expires_in: 900 });
      }
      if (url === poll("tok_r")) {
        polls++;
        if (polls === 1) throw new Error("ECONNRESET"); // transient
        return json(200, { status: "approved", api_key: "pk_r", email: "e@f.com" });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const code = await runCli(["auth:login"]);
    expect(code).toBe(0);
    expect(polls).toBe(2);
  });
});
