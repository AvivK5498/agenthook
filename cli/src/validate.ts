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

/** Map parsed CLI flags onto the tool-input body the API expects, using the
 * flag→param map derived from the tool schema (see flags.ts). Only flags the
 * user actually passed are present in `flags`, so server defaults stay in
 * charge; a global CLI flag (api-url/key/json/dry-run) has no param and is
 * skipped. The one non-direct case is `--no-audio` inverting to audio:false. */
export function buildToolInput(
  flags: FlagValues,
  paramForFlag: Record<string, { param: string; invert?: boolean }>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [flag, value] of Object.entries(flags)) {
    const mapping = paramForFlag[flag];
    if (!mapping) continue; // a global CLI flag, not a tool param
    input[mapping.param] = mapping.invert ? !value : value;
  }
  return input;
}

/** Returns human-readable problems (empty array = locally valid). `flagFor`
 * (derived from the schema) supplies the CLI flag spelling for messages. */
export function preValidate(
  tool: string,
  input: Record<string, unknown>,
  schemas: ToolSchema[],
  flagFor: Record<string, string>,
): string[] {
  const flag = (param: string) => flagFor[param] ?? "--" + param.replace(/_/g, "-");
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
