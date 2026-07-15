// Canned GET /tools payload + run responses for the mocked-fetch tests. Mirrors
// the shape of packages/core/contract.ts TOOLS_JSON_SCHEMA (a representative
// subset that exercises every ToolParamSpec field), never the live API.
import type { RunCreatedResponse, RunResponse, ToolSchema } from "../src/client.js";

export const CANNED_TOOLS: ToolSchema[] = [
  {
    name: "make_video",
    description: "Generate a video from a prompt and optional reference images.",
    params: {
      prompt: { type: "string", required: true, maxLength: 4000, description: "The video prompt." },
      reference_images: { type: "array", items: { type: "string" }, max: 14 },
      owns_references: { type: "boolean", description: "Required true when reference_images are attached." },
      model: { type: "string", enum: ["seedance-2", "kling-3"], default: "seedance-2" },
      duration: { type: "number", default: 5, min: 1, max: 12, description: "Video length in seconds." },
      audio: { type: "boolean", default: true },
    },
  },
  {
    name: "make_image",
    description: "Generate an image from a prompt.",
    params: {
      prompt: { type: "string", required: true, maxLength: 4000 },
      model: { type: "string", enum: ["gpt-image-2", "nano-banana-2"], default: "gpt-image-2" },
    },
  },
  {
    name: "caption_video",
    description: "Burn captions into a video.",
    params: {
      video_url: { type: "string", required: true },
    },
  },
  {
    name: "create_influencer",
    description: "Create a reusable character-consistent influencer.",
    params: {
      name: { type: "string", required: true },
      appearance: { type: "string", required: true, maxLength: 2000 },
    },
  },
];

export const CANNED_RUN_CREATED: RunCreatedResponse = {
  run_id: "run_abc123",
  status: "queued",
  credits_charged: 20,
};

export const CANNED_RUN_PROCESSING: RunResponse = {
  id: "run_abc123",
  tool: "make_video",
  model: "seedance-2",
  status: "processing",
  prompt: "a cat",
  enhanced_prompt: null,
  params: {},
  reference_images: [],
  owns_references: false,
  credits_charged: 20,
  output: [],
  transcript: null,
  error: null,
  created_at: "2026-07-12T00:00:00Z",
  started_at: "2026-07-12T00:00:01Z",
  completed_at: null,
};

export const CANNED_RUN_COMPLETED: RunResponse = {
  ...CANNED_RUN_PROCESSING,
  status: "completed",
  output: ["https://cdn.getagenthook.com/media/run_abc123.mp4"],
  completed_at: "2026-07-12T00:01:00Z",
};

/** A fetch stub: route by URL pathname to a canned JSON body. */
export function fetchStub(routes: { tools?: unknown; run?: unknown; get?: unknown }) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown;
    if (url.includes("/tools/") && url.endsWith("/run")) body = routes.run;
    else if (url.includes("/runs/")) body = routes.get;
    else if (url.endsWith("/tools")) body = routes.tools;
    else throw new Error(`unexpected fetch to ${url}`);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
    } as Response;
  };
}
