<div align="center">

# AgentHook

**Your agent makes character-consistent UGC video.**

Create one AI influencer, then reuse that same face in every video, image, and caption.
Add it as an MCP server, a skill, or a CLI. Works in Claude Code, Cursor, OpenClaw, Hermes, and n8n.

[![cli](https://img.shields.io/npm/v/getagenthook?color=c6fe1e&label=cli&style=flat-square)](https://www.npmjs.com/package/getagenthook)
[![mcp](https://img.shields.io/npm/v/@getagenthook/mcp?color=c6fe1e&label=mcp&style=flat-square)](https://www.npmjs.com/package/@getagenthook/mcp)
[![skills.sh](https://skills.sh/b/AvivK5498/agenthook)](https://skills.sh/AvivK5498/agenthook)
[![license](https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square)](./LICENSE)

**[getagenthook.com](https://getagenthook.com)** · [Docs](https://agenthook.mintlify.app) · [Agent reference](https://getagenthook.com/llms-full.txt)

</div>

---

## Install

Pick one. All three wrap the same API, so none of them drift.

```text
MCP     add "npx -y @getagenthook/mcp" to your MCP client config
Skill   npx skills add AvivK5498/agenthook --yes
CLI     npm i -g getagenthook
```

Or paste this to your agent and let it set itself up:

```text
Install the agenthook skill by running: npx skills add AvivK5498/agenthook --yes
Then follow the skill to set up AgentHook and make me a test image.
```

New accounts get 30 trial credits with no card. That covers a reusable influencer and a test image.

## Agents: start here

Read https://getagenthook.com/llms-full.txt first. It is the full API contract, generated from the live schemas. Then:

```bash
npm i -g getagenthook          # CLI (command: agenthook)
agenthook auth:login           # prints a link + code for your human
agenthook run make_video --dry-run --prompt "..."   # price it free, then drop --dry-run
```

## What it does

| Tool | In, then out |
|---|---|
| `make_video` | script + optional reference images, then a talking-head video with native speech |
| `make_image` | prompt or references, then stills |
| `caption_video` | any video URL, then burned-in captions + transcript |
| `create_influencer` | brief idea + name, then a reusable character: portrait + character sheet, usable via `--influencer` on every later run |

The wedge is `create_influencer`. Make an influencer once, and your agent asks for that same face by name in every `make_video` and `make_image` run after it. One face, a whole series.

`--enhance-prompt` rewrites a rough one-liner into a director-grade prompt before generating, and `--captions` returns the video already subtitled in `tiktok` or `movie` style. Idea in, post-ready MP4 out, one command. Most platforms leave both steps to you.

Prepaid credits, no subscription. Failed runs refund automatically. Outputs live on permanent CDN URLs.

**[Create an account](https://getagenthook.com/signup)**

## License

CLI and skill are Apache-2.0. The hosted service is a commercial product.
