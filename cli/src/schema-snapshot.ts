// Bundled snapshot of the tool schemas served by GET /v1/tools, so `run` can
// pre-validate locally on a fresh install (cold cache, offline) with ZERO
// network — spec §3: "blocks locally with a clear message before any network
// call". A fetched cache entry (from `tools` or `login`) supersedes this; the
// server re-validates everything authoritatively regardless.
//
// This is a literal copy of frozen packages/core/contract.ts TOOLS_JSON_SCHEMA
// (the CLI publishes standalone and cannot runtime-import the workspace).
// test/parity.test.ts pins it deep-equal to core's export — drift fails CI.
import type { ToolSchema } from "./types";

export const TOOLS_SNAPSHOT: ToolSchema[] = [
  {
    name: "make_video",
    description:
      "Generate a video (talking-head parity via Seedance native audio) from a prompt and optional reference images.",
    params: {
      prompt: { type: "string", required: true, maxLength: 4000 },
      reference_images: { type: "array", items: { type: "string" }, max: 14 },
      owns_references: {
        type: "boolean",
        description: "Required true when reference_images are attached (likeness consent).",
      },
      model: { type: "string", enum: ["seedance-2", "kling-3"], default: "seedance-2" },
      quality: { type: "string", enum: ["standard", "pro"], default: "standard" },
      duration: {
        type: "number",
        default: 5,
        min: 1,
        description:
          "Video length in seconds. Allowed values depend on model — seedance-2: 4, 5, 6, 8, 10, 12, 15; kling-3: 3, 5, 8, 10, 15.",
      },
      aspect_ratio: {
        type: "string",
        enum: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        default: "9:16",
      },
      audio: { type: "boolean", default: true },
      captions: {
        type: "boolean",
        default: false,
        description:
          "Burn spoken-word captions into the video. When true the run returns two files: output[0] is captioned, output[1] is the original uncaptioned video.",
      },
      caption_style: {
        type: "string",
        enum: ["chunk", "highlight", "subtitle"],
        default: "chunk",
        description:
          "Caption look. chunk = 2–4 words per line, centered, bold with a heavy outline (the standard TikTok/Reels style). highlight = the same block with the active word lit in colour (the Hormozi/retention style). subtitle = one clean line at the bottom (cinematic / YouTube).",
      },
      caption_size: { type: "string", enum: ["small", "medium", "large"], default: "medium", description: "Caption text size." },
      caption_placement: {
        type: "string",
        enum: ["top", "center", "bottom"],
        description: "Where captions sit. Defaults per style: chunk/highlight → center, subtitle → bottom.",
      },
      enhance_prompt: { type: "boolean", default: false },
      influencer: {
        type: "string",
        description:
          "Slug of a saved influencer — the server attaches its portrait + character sheet as references and prepends its appearance description to the prompt.",
      },
    },
  },
  {
    name: "make_image",
    description:
      "Generate or edit an image. With reference_images routes to Nano Banana 2 (RunPod); without, to GPT Image 2 (PiAPI).",
    params: {
      prompt: { type: "string", required: true },
      reference_images: { type: "array", items: { type: "string" }, max: 14 },
      owns_references: {
        type: "boolean",
        description: "Required true when reference_images are attached (likeness consent).",
      },
      model: { type: "string", enum: ["auto", "nano-banana-2", "gpt-image-2"], default: "auto" },
      aspect_ratio: {
        type: "string",
        enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
        default: "9:16",
      },
      resolution: { type: "string", enum: ["1k", "2k", "4k"], default: "1k" },
      count: { type: "number", default: 1, min: 1, max: 4 },
      enhance_prompt: { type: "boolean", default: false },
      influencer: {
        type: "string",
        description:
          "Slug of a saved influencer — the server attaches its portrait + character sheet as references and prepends its appearance description to the prompt.",
      },
    },
  },
  {
    name: "caption_video",
    description:
      "Burn styled captions into an existing video. Returns two files: output[0] is the captioned video, output[1] is the original uncaptioned video — so you can re-caption with a different style without regenerating. (A speechless video returns just the original.)",
    params: {
      video_url: { type: "string", required: true },
      style: {
        type: "string",
        enum: ["chunk", "highlight", "subtitle"],
        default: "chunk",
        description:
          "Caption look. chunk = bold centered word blocks (standard TikTok/Reels). highlight = active word lit in colour (Hormozi/retention). subtitle = clean bottom line (cinematic / YouTube).",
      },
      size: { type: "string", enum: ["small", "medium", "large"], default: "medium", description: "Caption text size." },
      placement: {
        type: "string",
        enum: ["top", "center", "bottom"],
        description: "Where captions sit. Defaults per style: chunk/highlight → center, subtitle → bottom.",
      },
      language: { type: "string", default: "auto" },
    },
  },
  {
    name: "create_influencer",
    description:
      "Create a reusable, account-bound influencer: a hero portrait + a multi-view character sheet. Flat 20 credits. The prompt is auto-rewritten server-side (always-on).",
    params: {
      prompt: { type: "string", required: true },
      name: { type: "string", required: true, min: 1, maxLength: 60 },
      slug: { type: "string", maxLength: 40 },
    },
  },
];
