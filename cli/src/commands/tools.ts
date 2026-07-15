import { parseArgs } from "../args";
import { resolveApiKey, resolveApiUrl } from "../config";
import { EXIT } from "../exit";
import { deriveRunFlags } from "../flags";
import { guardJson } from "../json-error";
import { getToolSchemas } from "../schemas";
import type { ToolParamSpec } from "../types";

export async function tools(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string", key: "string", json: "boolean" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const asJson = flags["json"] === true;
  const apiUrl = resolveApiUrl(flags["api-url"] as string | undefined);
  return guardJson(asJson, apiUrl, async () => {
    // Always fetch fresh (and warm the cache `run` pre-validates from).
    const schemas = await getToolSchemas(apiUrl, resolveApiKey(flags["key"] as string | undefined), { fresh: true });
    if (asJson) {
      console.log(JSON.stringify({ tools: schemas }));
      return EXIT.OK;
    }
    // Same derivation `run` parses against — the flag spelling shown here is
    // exactly the one that will work.
    const { flagFor } = deriveRunFlags(schemas);
    for (const tool of schemas) {
      console.log(`${tool.name} — ${tool.description}`);
      for (const [name, spec] of Object.entries(tool.params)) {
        console.log(`  ${renderParam(name, spec, flagFor)}`);
      }
      console.log("");
    }
    console.log(`Run one with: agenthook run <tool> --prompt "..." [flags]`);
    return EXIT.OK;
  });
}

function renderParam(name: string, spec: ToolParamSpec, flagFor: Record<string, string>): string {
  const flagName = flagFor[name] ?? `--${name.replace(/_/g, "-")}`;
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
