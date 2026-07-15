# @getagenthook/mcp

Local stdio MCP server for the AgentHook hosted media-generation API. Exposes
the same tools as the CLI — `make_video`, `make_image`, `caption_video`,
`create_influencer`, `get_run` — to any MCP client.

Add it to your MCP client config:

```json
{
  "mcpServers": {
    "agenthook": {
      "command": "npx",
      "args": ["-y", "@getagenthook/mcp"],
      "env": { "AGENTHOOK_API_KEY": "<your-api-key>" }
    }
  }
}
```

- `AGENTHOOK_API_KEY` authenticates every call (Bearer).
- API base: `AGENTHOOK_API_URL` env > `https://getagenthook.com`; all requests
  hit `<base>/api/v1/…`. https:// is enforced (http:// only for localhost).
- Tool schemas are served by the API and validated before any run is submitted.

Develop: `npm run build` (emits `dist/`), `npx vitest run`, `npx tsc --noEmit`.
