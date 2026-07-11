// Deterministic pre-validation (pure — unit-tested). Everything the server
// would 400 on and that is locally checkable gets rejected here, BEFORE any
// run is submitted: likeness consent, prompt caps, enum values, numeric
// ranges, ref counts, NB2-without-refs. The server remains the authoritative
// trust boundary; this exists so agents and humans fail fast and free.
import type { FlagValues } from "./args";
import type { ToolSchema } from "./types";

// Per-model prompt caps, mirroring packages/core/models.ts promptMax (frozen).
// GET /v1/tools only exposes the default model's cap on the prompt param, so
// the CLI keeps this map to pre-validate explicitly forced models.
// test/parity.test.ts pins these to core's registry.
export const PROMPT_CAPS: Record<string, number> = {
  "seedance-2": 4000,
  "kling-3": 2500,
};

export const OWNS_REFERENCES_CONSENT =
  "By passing --owns-references you attest that you own, or have the rights to use, " +
  "the likeness of every person appearing in the referenced images.";

/** CLI flag spelling for each API param — for readable error messages.
 * test/parity.test.ts asserts every param served by /v1/tools has an entry. */
export const FLAG_FOR: Record<string, string> = {
  prompt: "--prompt",
  reference_images: "--ref",
  owns_references: "--owns-references",
  model: "--model",
  quality: "--quality",
  duration: "--duration",
  aspect_ratio: "--aspect-ratio",
  audio: "--no-audio",
  captions: "--captions",
  caption_style: "--caption-style",
  enhance_prompt: "--enhance-prompt",
  video_url: "--video-url",
  style: "--style",
  count: "--count",
  resolution: "--resolution",
  language: "--language",
  name: "--name",
  slug: "--slug",
  influencer: "--influencer",
};

/** Map parsed CLI flags onto the tool-input body the API expects. Only flags
 * the user actually passed are included, so server defaults stay in charge. */
export function buildToolInput(flags: FlagValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const direct: [flag: string, param: string][] = [
    ["prompt", "prompt"],
    ["model", "model"],
    ["quality", "quality"],
    ["duration", "duration"],
    ["aspect-ratio", "aspect_ratio"],
    ["caption-style", "caption_style"],
    ["video-url", "video_url"],
    ["style", "style"],
    ["count", "count"],
    ["resolution", "resolution"],
    ["language", "language"],
    ["name", "name"],
    ["slug", "slug"],
    ["influencer", "influencer"],
  ];
  for (const [flag, param] of direct) {
    if (flags[flag] !== undefined) input[param] = flags[flag];
  }
  const refs = flags["ref"] as string[] | undefined;
  if (refs?.length) input.reference_images = refs;
  if (flags["owns-references"]) input.owns_references = true;
  if (flags["no-audio"]) input.audio = false;
  if (flags["captions"]) input.captions = true;
  if (flags["enhance-prompt"]) input.enhance_prompt = true;
  return input;
}

const flag = (param: string) => FLAG_FOR[param] ?? param;

/** Returns human-readable problems (empty array = locally valid). */
export function preValidate(
  tool: string,
  input: Record<string, unknown>,
  schemas: ToolSchema[],
): string[] {
  const schema = schemas.find((s) => s.name === tool);
  if (!schema) {
    return [`Unknown tool "${tool}". Available tools: ${schemas.map((s) => s.name).join(", ")}`];
  }
  const errors: string[] = [];

  // Flags that don't belong to this tool (e.g. --video-url on make_image).
  for (const key of Object.keys(input)) {
    if (!(key in schema.params)) errors.push(`${flag(key)} does not apply to ${tool}`);
  }

  // Required params.
  for (const [name, spec] of Object.entries(schema.params)) {
    if (spec.required && input[name] === undefined) {
      errors.push(`${tool} requires ${flag(name)}`);
    }
  }

  // Enum values, numeric ranges, array caps.
  for (const [name, spec] of Object.entries(schema.params)) {
    const value = input[name];
    if (value === undefined) continue;
    if (spec.enum && typeof value === "string" && !spec.enum.includes(value)) {
      errors.push(`Invalid value "${value}" for ${flag(name)} — valid: ${spec.enum.join(", ")}`);
    }
    if (spec.type === "number" && typeof value === "number") {
      if (!Number.isInteger(value)) errors.push(`${flag(name)} must be a whole number`);
      if (spec.min !== undefined && value < spec.min) errors.push(`${flag(name)} must be at least ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) errors.push(`${flag(name)} must be at most ${spec.max}`);
    }
    if (spec.type === "array" && Array.isArray(value) && spec.max !== undefined && value.length > spec.max) {
      errors.push(`At most ${spec.max} ${flag(name)} values are allowed (got ${value.length})`);
    }
  }

  const refs = input.reference_images as string[] | undefined;
  const hasRefs = !!refs?.length;

  // Likeness consent — refs require the explicit attestation.
  if (hasRefs && input.owns_references !== true) {
    errors.push(
      "Reference images require the --owns-references attestation.\n" +
        `  ${OWNS_REFERENCES_CONSENT}\n` +
        "  Fix: re-run the same command with --owns-references.",
    );
  }

  // URL shape for refs and video input.
  for (const r of refs ?? []) {
    if (!isUrl(r)) errors.push(`--ref "${r}" is not a valid URL`);
  }
  if (typeof input.video_url === "string" && !isUrl(input.video_url)) {
    errors.push(`--video-url "${input.video_url}" is not a valid URL`);
  }

  // Prompt cap for the effective model (explicit --model or the schema default).
  if (typeof input.prompt === "string") {
    const model = (input.model as string | undefined) ?? (schema.params.model?.default as string | undefined);
    const cap = (model !== undefined ? PROMPT_CAPS[model] : undefined) ?? schema.params.prompt?.maxLength;
    if (cap && input.prompt.length > cap) {
      errors.push(
        `--prompt is ${input.prompt.length} characters; the ${model ?? tool} cap is ${cap}. Shorten the prompt.`,
      );
    }
  }

  // NB2 (RunPod) is an edit endpoint — never callable without a reference.
  if (tool === "make_image" && input.model === "nano-banana-2" && !hasRefs) {
    errors.push(
      "nano-banana-2 is an edit model and needs at least one reference image.\n" +
        "  Fix: add --ref <url> (with --owns-references), or drop --model to auto-route " +
        "text-to-image to gpt-image-2.",
    );
  }

  return errors;
}

function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}
