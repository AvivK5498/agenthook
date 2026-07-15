import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { buildServer } from "../src/server.js";
import { CANNED_RUN_COMPLETED, CANNED_RUN_CREATED, CANNED_TOOLS, fetchStub } from "./fixtures.js";

const EXPECTED_TOOLS = ["make_video", "make_image", "caption_video", "create_influencer", "get_run"];

/** Connect a real MCP client to buildServer() over linked in-memory transports. */
async function connectClient() {
  const server = await buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client };
}

describe("MCP server (mocked fetch — no network, no generations)", () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    process.env.AGENTHOOK_API_KEY = "ah_test_key";
    delete process.env.AGENTHOOK_API_URL;
    // stdout is sacred on stdio — nothing but JSON-RPC frames may touch it.
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as MockInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.AGENTHOOK_API_KEY;
  });

  it("registers exactly the 5 tools with correct names", async () => {
    vi.stubGlobal("fetch", fetchStub({ tools: { tools: CANNED_TOOLS } }));
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(tools).toHaveLength(5);
  });

  it("derives each generation tool's inputSchema from the live GET /tools schema", async () => {
    vi.stubGlobal("fetch", fetchStub({ tools: { tools: CANNED_TOOLS } }));
    const { client } = await connectClient();
    const { tools } = await client.listTools();

    const makeVideo = tools.find((t) => t.name === "make_video")!;
    expect(makeVideo.inputSchema.type).toBe("object");
    const props = makeVideo.inputSchema.properties as Record<string, { type: string; enum?: unknown; maxItems?: number }>;
    expect(props.prompt!.type).toBe("string");
    expect(props.model!.enum).toEqual(["seedance-2", "kling-3"]);
    expect(props.reference_images!.maxItems).toBe(14);
    expect(makeVideo.inputSchema.required).toEqual(["prompt"]);

    const getRun = tools.find((t) => t.name === "get_run")!;
    expect((getRun.inputSchema.properties as Record<string, unknown>).run_id).toBeDefined();
    expect(getRun.inputSchema.required).toEqual(["run_id"]);
  });

  it("a generation tool call submits and returns {run_id, credits_charged}", async () => {
    vi.stubGlobal("fetch", fetchStub({ tools: { tools: CANNED_TOOLS }, run: CANNED_RUN_CREATED }));
    const { client } = await connectClient();

    const res = await client.callTool({
      name: "make_video",
      arguments: { prompt: "a cat sipping coffee" },
    });
    expect(res.structuredContent).toEqual({ run_id: "run_abc123", credits_charged: 20 });
    // text fallback carries the run id too.
    const text = (res.content as { type: string; text: string }[])[0]!;
    expect(text.type).toBe("text");
    expect(text.text).toContain("run_abc123");
  });

  it("get_run surfaces status + output[]", async () => {
    vi.stubGlobal("fetch", fetchStub({ tools: { tools: CANNED_TOOLS }, get: CANNED_RUN_COMPLETED }));
    const { client } = await connectClient();

    const res = await client.callTool({ name: "get_run", arguments: { run_id: "run_abc123" } });
    expect(res.structuredContent).toEqual({
      status: "completed",
      output: ["https://cdn.getagenthook.com/media/run_abc123.mp4"],
      error: null,
    });
  });

  it("surfaces an API failure as a tool error (isError), not a crash", async () => {
    const failFetch = async (): Promise<Response> =>
      ({ ok: false, status: 402, statusText: "Payment Required", json: async () => ({ error: "Not enough credits" }) }) as Response;
    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.endsWith("/tools")) return fetchStub({ tools: { tools: CANNED_TOOLS } })(input);
      return failFetch();
    });
    const { client } = await connectClient();

    const res = await client.callTool({ name: "make_video", arguments: { prompt: "x" } });
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toContain("Not enough credits");
  });

  it("never writes to stdout during a full round-trip", async () => {
    vi.stubGlobal("fetch", fetchStub({ tools: { tools: CANNED_TOOLS }, run: CANNED_RUN_CREATED }));
    const { client } = await connectClient();
    await client.listTools();
    await client.callTool({ name: "make_video", arguments: { prompt: "x" } });
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe("missing AGENTHOOK_API_KEY", () => {
  let stdoutSpy: MockInstance;

  beforeEach(() => {
    delete process.env.AGENTHOOK_API_KEY;
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as MockInstance;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fails loud (throws) before any network call, and writes nothing to stdout", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be touched when the key is missing");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(buildServer()).rejects.toThrow(/AGENTHOOK_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});
