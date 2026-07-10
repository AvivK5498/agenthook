import { parseArgs } from "../args";
import { resolveApiUrl, storedApiKey } from "../config";
import { getToolSchemas } from "../schemas";
import { FLAG_FOR } from "../validate";
import type { ToolParamSpec } from "../types";

export async function tools(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return 1;
  }
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  // Always fetch fresh (and warm the cache `run` pre-validates from).
  const schemas = await getToolSchemas(apiUrl, storedApiKey(), { fresh: true });

  for (const tool of schemas) {
    console.log(`${tool.name} — ${tool.description}`);
    for (const [name, spec] of Object.entries(tool.params)) {
      console.log(`  ${renderParam(name, spec)}`);
    }
    console.log("");
  }
  console.log(`Run one with: placeholder-name run <tool> --prompt "..." [flags]`);
  return 0;
}

function renderParam(name: string, spec: ToolParamSpec): string {
  const flagName = FLAG_FOR[name] ?? `--${name.replace(/_/g, "-")}`;
  const hint =
    spec.type === "boolean"
      ? ""
      : spec.enum
        ? ` <${spec.enum.join("|")}>`
        : spec.type === "array"
          ? " <url>"
          : spec.type === "number"
            ? " <n>"
            : " <text>";
  const attrs: string[] = [];
  if (spec.required) attrs.push("required");
  if (name === "audio") attrs.push("passing it disables audio (default on)");
  else if (spec.default !== undefined) attrs.push(`default ${JSON.stringify(spec.default)}`);
  if (spec.type === "array") attrs.push(`repeatable${spec.max !== undefined ? `, up to ${spec.max}` : ""}`);
  if (spec.maxLength !== undefined) attrs.push(`max ${spec.maxLength} chars`);
  if (spec.description) attrs.push(spec.description);
  return `${(flagName + hint).padEnd(34)}${attrs.join("; ")}`;
}
