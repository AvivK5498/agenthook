// Pre-validation is pure — tested directly against core's real
// TOOLS_JSON_SCHEMA (what GET /v1/tools serves).
import { describe, expect, test } from "vitest";
import { TOOLS_JSON_SCHEMA } from "../../core/contract";
import { deriveRunFlags } from "../src/flags";
import { buildToolInput, OWNS_REFERENCES_CONSENT, preValidate, PROMPT_CAPS } from "../src/validate";

const schemas = TOOLS_JSON_SCHEMA;
// The flag⇄param maps `buildToolInput`/`preValidate` now take are derived from
// the very schema the server serves — same derivation `run` uses.
const { paramForFlag, flagFor } = deriveRunFlags(schemas);
const ok = (tool: string, input: Record<string, unknown>) => preValidate(tool, input, schemas, flagFor);
const build = (flags: Parameters<typeof buildToolInput>[0]) => buildToolInput(flags, paramForFlag);

describe("buildToolInput", () => {
  test("maps flags to API params, omitting what was not passed", () => {
    const input = build({
      prompt: "hi",
      ref: ["https://a/1.jpg"],
      "owns-references": true,
      "aspect-ratio": "9:16",
      "no-audio": true,
      captions: true,
      "caption-style": "chunk",
      "caption-size": "large",
      "caption-placement": "top",
      "enhance-prompt": true,
      duration: 8,
    });
    expect(input).toEqual({
      prompt: "hi",
      reference_images: ["https://a/1.jpg"],
      owns_references: true,
      aspect_ratio: "9:16",
      audio: false,
      captions: true,
      caption_style: "chunk",
      caption_size: "large",
      caption_placement: "top",
      enhance_prompt: true,
      duration: 8,
    });
  });

  test("maps caption_video refinements (--size / --placement)", () => {
    const input = build({
      "video-url": "https://a/v.mp4",
      style: "highlight",
      size: "small",
      placement: "bottom",
    });
    expect(input).toEqual({
      video_url: "https://a/v.mp4",
      style: "highlight",
      size: "small",
      placement: "bottom",
    });
  });

  test("no flags → empty input (server defaults rule)", () => {
    expect(build({})).toEqual({});
  });

  test("global CLI flags (api-url/key/json/dry-run) are not tool params", () => {
    expect(build({ "api-url": "https://x", key: "k", json: true, "dry-run": true, prompt: "hi" })).toEqual({
      prompt: "hi",
    });
  });
});

describe("preValidate", () => {
  test("valid minimal make_video passes", () => {
    expect(ok("make_video", { prompt: "a person talking" })).toEqual([]);
  });

  test("unknown tool names the available ones", () => {
    const errs = ok("make_ugc", { prompt: "x" });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('Unknown tool "make_ugc"');
    expect(errs[0]).toContain("make_video");
  });

  test("refs without owns_references → consent sentence + fix", () => {
    const errs = ok("make_video", { prompt: "x", reference_images: ["https://a/1.jpg"] });
    expect(errs.join("\n")).toContain(OWNS_REFERENCES_CONSENT);
    expect(errs.join("\n")).toContain("--owns-references");
    expect(errs.join("\n")).toContain("re-run the same command with --owns-references");
  });

  test("refs WITH owns_references pass", () => {
    expect(
      ok("make_video", { prompt: "x", reference_images: ["https://a/1.jpg"], owns_references: true }),
    ).toEqual([]);
  });

  test("prompt over the default model's cap (seedance-2: 4000)", () => {
    const errs = ok("make_video", { prompt: "x".repeat(4001) });
    expect(errs.join("\n")).toContain("4000");
    expect(errs.join("\n")).toContain("seedance-2");
  });

  test("prompt cap follows the forced model (kling-3: 2500)", () => {
    const prompt = "x".repeat(3000); // fine for seedance, over kling's cap
    expect(ok("make_video", { prompt })).toEqual([]);
    const errs = ok("make_video", { prompt, model: "kling-3" });
    expect(errs.join("\n")).toContain("2500");
  });

  test("invalid enum value lists the valid ones", () => {
    const errs = ok("make_video", { prompt: "x", quality: "ultra" });
    expect(errs.join("\n")).toContain('Invalid value "ultra" for --quality');
    expect(errs.join("\n")).toContain("standard, pro");
  });

  test("invalid caption style rejected", () => {
    const errs = ok("caption_video", { video_url: "https://a/v.mp4", style: "karaoke" });
    expect(errs.join("\n")).toContain("chunk, highlight, subtitle");
  });

  test("nano-banana-2 forced without refs is rejected with the fix", () => {
    const errs = ok("make_image", { prompt: "x", model: "nano-banana-2" });
    expect(errs.join("\n")).toContain("nano-banana-2 is an edit model");
    expect(errs.join("\n")).toContain("--ref");
    expect(errs.join("\n")).toContain("gpt-image-2");
  });

  test("nano-banana-2 with refs + consent passes", () => {
    expect(
      ok("make_image", {
        prompt: "x",
        model: "nano-banana-2",
        reference_images: ["https://a/1.jpg"],
        owns_references: true,
      }),
    ).toEqual([]);
  });

  test("missing required param is named by flag", () => {
    expect(ok("make_video", {}).join("\n")).toContain("make_video requires --prompt");
    expect(ok("caption_video", {}).join("\n")).toContain("caption_video requires --video-url");
  });

  test("create_influencer requires --name and --prompt", () => {
    expect(ok("create_influencer", { prompt: "an indie singer" }).join("\n")).toContain(
      "create_influencer requires --name",
    );
    expect(ok("create_influencer", { name: "Maya" }).join("\n")).toContain(
      "create_influencer requires --prompt",
    );
    expect(ok("create_influencer", { prompt: "an indie singer", name: "Maya" })).toEqual([]);
    // Optional slug is accepted; its [a-z0-9-] regex is not expressible in the
    // JSON-schema ToolParamSpec (maxLength only) — the server 400s a bad slug.
    expect(ok("create_influencer", { prompt: "x", name: "Maya", slug: "maya" })).toEqual([]);
  });

  test("param not belonging to the tool is rejected", () => {
    const errs = ok("make_image", { prompt: "x", video_url: "https://a/v.mp4" });
    expect(errs.join("\n")).toContain("--video-url does not apply to make_image");
  });

  test("too many refs rejected at the schema cap", () => {
    const refs = Array.from({ length: 15 }, (_, i) => `https://a/${i}.jpg`);
    const errs = ok("make_video", { prompt: "x", reference_images: refs, owns_references: true });
    expect(errs.join("\n")).toContain("At most 14");
  });

  test("count outside 1–4 rejected", () => {
    expect(ok("make_image", { prompt: "x", count: 9 }).join("\n")).toContain("--count must be at most 4");
    expect(ok("make_image", { prompt: "x", count: 0 }).join("\n")).toContain("--count must be at least 1");
  });

  test("malformed --ref / --video-url URLs rejected", () => {
    expect(
      ok("make_video", { prompt: "x", reference_images: ["not-a-url"], owns_references: true }).join("\n"),
    ).toContain('--ref "not-a-url" is not a valid URL');
    expect(ok("caption_video", { video_url: "nope" }).join("\n")).toContain(
      '--video-url "nope" is not a valid URL',
    );
  });

  test("PROMPT_CAPS covers every video model the schema offers", () => {
    const videoModels = schemas.find((s) => s.name === "make_video")!.params.model!.enum!;
    for (const m of videoModels) expect(PROMPT_CAPS[m], `cap for ${m}`).toBeTypeOf("number");
  });
});
