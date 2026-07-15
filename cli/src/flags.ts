// The single source of `run`'s flags: they are DERIVED from the live tool
// schema (GET /v1/tools), not hardcoded — so a new API param becomes a usable
// CLI flag without republishing the CLI. `deriveRunFlags` unions every tool's
// params into one parse spec plus the flag⇄param maps `run` needs.
import type { FlagSpec, FlagType } from "./args";
import type { ToolSchema } from "./types";

/** Flags that are NOT tool params and must always parse (any command shape). */
export const CLI_FLAGS: FlagSpec = {
  "api-url": "string",
  key: "string",
  json: "boolean",
  "dry-run": "boolean",
};

/** The two places the CLI flag intentionally differs from a mechanical
 * snake→kebab of the param name (everything else is derived). */
export const FLAG_ALIAS: Record<string, { flag: string; invertBoolean?: boolean }> = {
  reference_images: { flag: "ref" },
  audio: { flag: "no-audio", invertBoolean: true }, // --no-audio sets audio:false
};

const FLAG_TYPES: readonly FlagType[] = ["string", "number", "boolean", "array"];

export interface DerivedRunFlags {
  /** Parse spec: global CLI flags + one flag per tool param. */
  spec: FlagSpec;
  /** flag → the param it fills (and whether the boolean inverts). */
  paramForFlag: Record<string, { param: string; invert?: boolean }>;
  /** param → its CLI flag spelling (for readable validation messages). */
  flagFor: Record<string, string>;
}

/** Union every tool's params into the run flag spec + flag⇄param maps. Params
 * repeat across tools (same flag name each time) — the union is idempotent. */
export function deriveRunFlags(schemas: ToolSchema[]): DerivedRunFlags {
  const spec: FlagSpec = { ...CLI_FLAGS };
  const paramForFlag: DerivedRunFlags["paramForFlag"] = {};
  const flagFor: Record<string, string> = {};
  for (const schema of schemas) {
    for (const [param, p] of Object.entries(schema.params)) {
      const alias = FLAG_ALIAS[param];
      const flag = alias?.flag ?? param.replace(/_/g, "-");
      let type: FlagType = FLAG_TYPES.includes(p.type as FlagType) ? (p.type as FlagType) : "string";
      if (alias?.invertBoolean) type = "boolean";
      spec[flag] = type;
      paramForFlag[flag] = { param, invert: alias?.invertBoolean };
      flagFor[param] = "--" + flag;
    }
  }
  return { spec, paramForFlag, flagFor };
}
