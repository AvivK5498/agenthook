# agenthook

[![npm](https://img.shields.io/npm/v/getagenthook?color=c6fe1e&label=getagenthook&style=flat-square)](https://www.npmjs.com/package/getagenthook)

CLI for the AgentHook hosted media-generation API. Built for agents:
progress goes to stderr, output URLs go to stdout, exit codes are meaningful.

```sh
npm i -g getagenthook        # or: npx getagenthook <command>

agenthook login --key <your-api-key>
agenthook tools
agenthook run make_video --prompt "A barista holds a latte and says: try our new oat flat white" --quality pro --aspect-ratio 9:16 --captions
agenthook run make_image --prompt "studio shot of a ceramic mug" --count 2
agenthook run caption_video --video-url https://…/video.mp4 --style chunk
agenthook list --search "flat white"
agenthook balance
agenthook history
```

- Credentials live at `~/.agenthook/credentials.json` (chmod 600).
- API base: `--api-url` flag > `AGENTHOOK_API_URL` env > stored value >
  `https://getagenthook.com`; all requests hit `<base>/api/v1/…`.
- Reference images (`--ref`, repeatable) require `--owns-references`: you attest
  you own, or have the rights to use, the likeness of every person appearing in
  the referenced images.
- Everything deterministically checkable is validated locally against the
  schemas served by `GET /v1/tools` (cached 1h) **before** any run is
  submitted: consent, prompt length caps, enum values, ranges, and
  `nano-banana-2` (edit-only) without references.

## MCP server

If your agent speaks MCP, it can call AgentHook directly instead of going through
the CLI. The server ships as `@getagenthook/mcp` and runs over `npx`. Add this to
your MCP client config (Claude Code, Cursor, and similar):

```json
{
  "mcpServers": {
    "agenthook": {
      "command": "npx",
      "args": ["-y", "@getagenthook/mcp"],
      "env": { "AGENTHOOK_API_KEY": "ah_your_key" }
    }
  }
}
```

It exposes `make_video`, `make_image`, `caption_video`, and `create_influencer`,
plus `get_run`. The generation tools return a `run_id`; pass it to `get_run` to
fetch the finished URL once the job is done.

## Develop

`npm run build` (emits `dist/`), `npx vitest run`, `npx tsc --noEmit`.
