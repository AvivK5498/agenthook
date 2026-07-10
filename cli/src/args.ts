// Tiny argv parser — no dependency needed for six commands.
// Supports: --flag value, --flag=value, boolean flags, repeatable flags
// ("array" type), numeric coercion, and unknown-flag rejection.

export type FlagType = "string" | "number" | "boolean" | "array";
export type FlagSpec = Record<string, FlagType>;
export type FlagValues = Record<string, string | number | boolean | string[]>;

export interface ParsedArgs {
  positionals: string[];
  flags: FlagValues;
  errors: string[];
}

export function parseArgs(argv: string[], spec: FlagSpec): ParsedArgs {
  const out: ParsedArgs = { positionals: [], flags: {}, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      out.positionals.push(arg);
      continue;
    }
    let name = arg.slice(2);
    let inline: string | undefined;
    const eq = name.indexOf("=");
    if (eq !== -1) {
      inline = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    const type = spec[name];
    if (!type) {
      out.errors.push(`unknown flag --${name}`);
      continue;
    }
    if (type === "boolean") {
      if (inline !== undefined) out.errors.push(`--${name} does not take a value`);
      else out.flags[name] = true;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out.errors.push(`--${name} requires a value`);
        continue;
      }
      value = next;
      i++;
    }
    if (type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) out.errors.push(`--${name} expects a number, got "${value}"`);
      else out.flags[name] = n;
    } else if (type === "array") {
      const prev = (out.flags[name] as string[] | undefined) ?? [];
      prev.push(value);
      out.flags[name] = prev;
    } else {
      out.flags[name] = value;
    }
  }
  return out;
}
