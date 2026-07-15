// Stdio MCP server: a thin 1:1 proxy over the AgentHook REST API.
//
// DEVIATION FROM SPEC §5 (flagged): the spec names the high-level
// `McpServer.registerTool`, but in @modelcontextprotocol/sdk v1.29.0 that API
// accepts ONLY a Zod schema for `inputSchema` and converts it to JSON Schema
// internally — it cannot consume a pre-built JSON Schema (a raw JSON object is
// coerced to an empty schema; verified against the SDK source). The spec's
// load-bearing requirement (deliverables #3/#4: tool inputSchemas built LIVE
// from GET /tools via toJsonSchema, so they never drift) is only satisfiable by
// serving that JSON Schema verbatim — which the low-level `Server` does. So we
// use `Server` + ListTools/CallTool handlers. Same SDK, same transport; the
// only difference is toJsonSchema's output IS the wire inputSchema, unmodified.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ApiError, fetchTools, getRun, resolveApiKey, submitRun, VERSION } from "./client.js";
import { toJsonSchema } from "./schema.js";

const GET_RUN_TOOL = "get_run";

// structuredContent contracts (advertised as each tool's outputSchema).
const RUN_CREATED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    run_id: { type: "string", description: "Poll this id with get_run for status + output URLs." },
    credits_charged: { type: "number" },
  },
  required: ["run_id", "credits_charged"],
  additionalProperties: false,
} as const;

const GET_RUN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    run_id: { type: "string", description: "The run id returned by a generation tool." },
  },
  required: ["run_id"],
  additionalProperties: false,
} as const;

const GET_RUN_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", description: "queued | processing | completed | failed" },
    output: { type: "array", items: { type: "string" }, description: "Output URLs when completed." },
    error: { type: ["string", "null"] },
  },
  required: ["status", "output"],
  additionalProperties: false,
} as const;

/** Build the (fully wired) MCP server. Reads AGENTHOOK_API_KEY and fails loud
 * BEFORE any network call if it is missing; then fetches the live tool schema
 * and registers the 4 generation tools + get_run. Throws on failure — the
 * caller (main.ts) writes the message to stderr and exits non-zero. */
export async function buildServer(): Promise<Server> {
  if (!resolveApiKey()) {
    throw new Error(
      "AGENTHOOK_API_KEY is not set. Add your key (ah_...) to the MCP server's env. " +
        "Get one at https://getagenthook.com.",
    );
  }

  const tools = await fetchTools();
  const generationTools = new Set(tools.map((t) => t.name));

  const toolList = [
    ...tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toJsonSchema(t.params),
      outputSchema: RUN_CREATED_OUTPUT_SCHEMA,
    })),
    {
      name: GET_RUN_TOOL,
      description:
        "Fetch the status and output URLs of a run created by a generation tool. Poll this until status is 'completed' or 'failed'.",
      inputSchema: GET_RUN_INPUT_SCHEMA,
      outputSchema: GET_RUN_OUTPUT_SCHEMA,
    },
  ];

  const server = new Server({ name: "agenthook", version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: toolList }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (name === GET_RUN_TOOL) {
        const run = await getRun(String(args.run_id ?? ""));
        const structured = { status: run.status, output: run.output, error: run.error };
        return { structuredContent: structured, content: [{ type: "text", text: JSON.stringify(structured) }] };
      }
      if (generationTools.has(name)) {
        const created = await submitRun(name, args);
        const structured = { run_id: created.run_id, credits_charged: created.credits_charged };
        return {
          structuredContent: structured,
          content: [
            {
              type: "text",
              text: `Run ${created.run_id} submitted (${created.credits_charged} credits charged). Call get_run with this run_id to fetch the result.`,
            },
          ],
        };
      }
      throw new Error(`Unknown tool: ${name}`);
    } catch (e) {
      // Surface API/errors to the agent as a tool error (not a protocol crash).
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  });

  return server;
}

/** Boot: build the server and connect it to stdio. */
export async function startServer(): Promise<void> {
  const server = await buildServer();
  await server.connect(new StdioServerTransport());
  console.error("agenthook MCP server ready on stdio.");
}
