import { describe, expect, test } from "vitest";
import { parseArgs } from "../src/args";

const spec = {
  prompt: "string",
  ref: "array",
  duration: "number",
  captions: "boolean",
} as const;

describe("parseArgs", () => {
  test("string flag with space-separated value", () => {
    const p = parseArgs(["--prompt", "hello world"], spec);
    expect(p.flags["prompt"]).toBe("hello world");
    expect(p.errors).toEqual([]);
  });

  test("--flag=value form", () => {
    const p = parseArgs(["--prompt=hi"], spec);
    expect(p.flags["prompt"]).toBe("hi");
  });

  test("repeatable array flag accumulates", () => {
    const p = parseArgs(["--ref", "https://a/1.jpg", "--ref", "https://a/2.jpg"], spec);
    expect(p.flags["ref"]).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
  });

  test("boolean flag takes no value", () => {
    const p = parseArgs(["--captions"], spec);
    expect(p.flags["captions"]).toBe(true);
    expect(parseArgs(["--captions=yes"], spec).errors).toContain("--captions does not take a value");
  });

  test("number flag coerces and rejects non-numbers", () => {
    expect(parseArgs(["--duration", "8"], spec).flags["duration"]).toBe(8);
    expect(parseArgs(["--duration", "abc"], spec).errors).toContain('--duration expects a number, got "abc"');
  });

  test("unknown flag is an error", () => {
    expect(parseArgs(["--bogus", "x"], spec).errors).toContain("unknown flag --bogus");
  });

  test("value flag at end without value is an error", () => {
    expect(parseArgs(["--prompt"], spec).errors).toContain("--prompt requires a value");
  });

  test("positionals collected", () => {
    const p = parseArgs(["make_video", "--captions"], spec);
    expect(p.positionals).toEqual(["make_video"]);
  });
});
