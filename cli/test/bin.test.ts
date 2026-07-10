// Spawns the actual built binary (package.json "bin" target) — the one thing
// unit tests that import modules can never catch. Guards against a silent or
// broken dist entrypoint reaching npm.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
const binPath = path.join(__dirname, "..", pkg.bin.agenthook);

function runBin(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [binPath, ...args], { encoding: "utf8" });
    return { stdout, stderr: "", status: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? -1 };
  }
}

describe("built binary (dist entrypoint)", () => {
  it("exists — build before testing", () => {
    expect(fs.existsSync(binPath)).toBe(true);
  });

  it("--help prints usage and exits 0", () => {
    const r = runBin(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage: agenthook");
    expect(r.stdout).toContain("run <tool>");
  });

  it("no args prints usage and exits 1", () => {
    const r = runBin([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Usage: agenthook");
  });

  it("unknown command errors on stderr and exits 1", () => {
    const r = runBin(["frobnicate"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Unknown command "frobnicate"');
  });
});
