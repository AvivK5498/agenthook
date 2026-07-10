// Anti-drift parity: the CLI ships standalone (no runtime import of the
// workspace), so the few values it mirrors from frozen @agenthook/core are
// pinned here against the real thing (test-only relative imports).
import { describe, expect, test } from "vitest";
import { TOOLS, TOOLS_JSON_SCHEMA, validateToolInput, type ToolName } from "../../core/contract";
import { MODELS } from "../../core/models";
import { DEFAULT_TIMEOUT_MS as CORE_TIMEOUT } from "../../core/net";
import { DEFAULT_TIMEOUT_MS } from "../src/http";
import { TOOLS_SNAPSHOT } from "../src/schema-snapshot";
import { FLAG_FOR, preValidate, PROMPT_CAPS } from "../src/validate";

describe("CLI ↔ core parity", () => {
  test("PROMPT_CAPS mirrors core MODELS promptMax", () => {
    expect(PROMPT_CAPS["seedance-2"]).toBe(MODELS["seedance-2"].promptMax);
    expect(PROMPT_CAPS["kling-3"]).toBe(MODELS["kling-3"].promptMax);
  });

  test("timeout policy mirrors core net.ts", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(CORE_TIMEOUT);
  });

  test("bundled schema snapshot is byte-identical to core TOOLS_JSON_SCHEMA", () => {
    // Cold-start pre-validation runs against this snapshot (zero network on a
    // fresh install) — any core schema change must land here too.
    expect(TOOLS_SNAPSHOT).toEqual(TOOLS_JSON_SCHEMA);
  });

  test("every tool and every served param is drivable from the CLI", () => {
    expect(TOOLS_JSON_SCHEMA.map((t) => t.name)).toEqual([...TOOLS]);
    for (const tool of TOOLS_JSON_SCHEMA) {
      for (const param of Object.keys(tool.params)) {
        expect(FLAG_FOR[param], `flag for ${tool.name}.${param}`).toBeDefined();
      }
    }
  });

  test("preValidate agrees with core validateToolInput on accept/reject", () => {
    const cases: [ToolName, Record<string, unknown>][] = [
      ["make_video", { prompt: "hello" }],
      ["make_video", { prompt: "hello", reference_images: ["https://a/1.jpg"] }], // consent missing
      ["make_video", { prompt: "hello", reference_images: ["https://a/1.jpg"], owns_references: true }],
      ["make_video", { prompt: "x".repeat(4001) }], // over seedance cap
      ["make_video", { prompt: "x".repeat(3000), model: "kling-3" }], // over kling cap
      ["make_video", { prompt: "hi", quality: "ultra" }], // bad enum
      ["make_image", { prompt: "hi" }],
      ["make_image", { prompt: "hi", count: 9 }], // over max
      ["caption_video", { video_url: "https://a/v.mp4" }],
      ["caption_video", { video_url: "https://a/v.mp4", style: "karaoke" }], // bad enum
    ];
    for (const [tool, input] of cases) {
      const cli = preValidate(tool, input, TOOLS_JSON_SCHEMA).length === 0;
      const core = validateToolInput(tool, input).ok;
      expect(cli, `${tool} ${JSON.stringify(input)}`).toBe(core);
    }
  });
});
