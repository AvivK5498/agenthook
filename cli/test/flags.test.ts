// The derivation is pure — flags come from the schema, not a hardcoded list.
import { describe, expect, test } from "vitest";
import { CLI_FLAGS, deriveRunFlags } from "../src/flags";
import { buildToolInput } from "../src/validate";
import type { ToolSchema } from "../src/types";

// A synthetic schema exercising each rule, incl. an unknown future type.
const schema = [
  {
    name: "demo",
    description: "d",
    params: {
      prompt: { type: "string", required: true },
      max_frames: { type: "number", min: 1, max: 10 },
      reference_images: { type: "array", items: { type: "string" }, max: 4 },
      audio: { type: "boolean", default: true },
      loud: { type: "boolean" },
      weird: { type: "json" }, // an unknown/future type → falls back to string
    },
  },
] as unknown as ToolSchema[];

describe("deriveRunFlags", () => {
  test("mechanical param → kebab flag with the matching type", () => {
    const { spec, paramForFlag, flagFor } = deriveRunFlags(schema);
    expect(spec["max-frames"]).toBe("number");
    expect(flagFor["max_frames"]).toBe("--max-frames");
    expect(paramForFlag["max-frames"]).toEqual({ param: "max_frames", invert: undefined });
  });

  test("reference_images → --ref (array, no invert)", () => {
    const { spec, flagFor, paramForFlag } = deriveRunFlags(schema);
    expect(flagFor["reference_images"]).toBe("--ref");
    expect(spec["ref"]).toBe("array");
    expect(paramForFlag["ref"]?.param).toBe("reference_images");
    expect(paramForFlag["ref"]?.invert).toBeFalsy();
  });

  test("audio → --no-audio (boolean, inverts)", () => {
    const { spec, flagFor, paramForFlag } = deriveRunFlags(schema);
    expect(flagFor["audio"]).toBe("--no-audio");
    expect(spec["no-audio"]).toBe("boolean");
    expect(paramForFlag["no-audio"]).toEqual({ param: "audio", invert: true });
  });

  test("unknown param type falls back to a string flag", () => {
    expect(deriveRunFlags(schema).spec["weird"]).toBe("string");
  });

  test("global CLI flags are always present and are not tool params", () => {
    const { spec, paramForFlag } = deriveRunFlags(schema);
    for (const [f, t] of Object.entries(CLI_FLAGS)) expect(spec[f]).toBe(t);
    for (const f of Object.keys(CLI_FLAGS)) expect(paramForFlag[f]).toBeUndefined();
  });

  test("params repeating across tools union idempotently (same flag each time)", () => {
    const two: ToolSchema[] = [schema[0]!, { ...schema[0]!, name: "demo2" }];
    expect(deriveRunFlags(two)).toEqual(deriveRunFlags([schema[0]!]));
  });
});

describe("buildToolInput round-trips through the derivation", () => {
  const { paramForFlag } = deriveRunFlags(schema);

  test("maps flags → params and inverts --no-audio", () => {
    const input = buildToolInput(
      { prompt: "hi", ref: ["https://a/1.jpg"], "max-frames": 5, "no-audio": true, loud: true },
      paramForFlag,
    );
    expect(input).toEqual({
      prompt: "hi",
      reference_images: ["https://a/1.jpg"],
      max_frames: 5,
      audio: false,
      loud: true,
    });
  });

  test("global flags (api-url/json) are skipped, not sent as params", () => {
    expect(buildToolInput({ "api-url": "https://x", json: true, prompt: "hi" }, paramForFlag)).toEqual({
      prompt: "hi",
    });
  });
});
