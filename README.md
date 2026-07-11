<div align="center">

# AgentHook

**Your agent's video studio.**

UGC video, images, and captioned clips from Claude Code, Cursor, n8n, or any shell.
One REST API. Your agent gets a finished MP4.

[![npm](https://img.shields.io/badge/npm-getagenthook-c6fe1e?style=flat-square)](https://www.npmjs.com/package/getagenthook)
[![skills.sh](https://skills.sh/b/AvivK5498/agenthook)](https://skills.sh/AvivK5498/agenthook)
[![license](https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square)](./LICENSE)

**[getagenthook.com](https://getagenthook.com)** · [Docs](https://agenthook.mintlify.app) · [Agent reference](https://getagenthook.com/llms-full.txt)

</div>

---

## Humans: paste this into your agent

```text
Install the agenthook skill by running: npx skills add AvivK5498/agenthook --yes
Then follow the skill to set up AgentHook and make me a test video.
```

Your agent installs the [skill](./skills/agenthook/SKILL.md), sends you a link to approve (new accounts get 30 trial credits), and comes back with a video URL. Nothing else to configure.

## Agents: start here

Read https://getagenthook.com/llms-full.txt first. It is the full API contract, generated from the live schemas. Then:

```bash
npm i -g getagenthook          # CLI (command: agenthook)
agenthook auth:login           # prints a link + code for your human
agenthook run make_video --dry-run --prompt "..."   # price it free, then drop --dry-run
```

## What it does

| Tool | In → Out |
|---|---|
| `make_video` | script + optional reference images → talking-head video, native speech |
| `make_image` | prompt or references → stills |
| `caption_video` | any video URL → burned-in captions + transcript |
| `create_influencer` | brief idea + name → reusable character: portrait + character sheet, usable via `--influencer` on every later run |

**Throw your agent an idea, not a screenplay.** `--enhance-prompt` rewrites a rough one-liner into a director-grade prompt before generating, and `--captions` returns the video already subtitled in `tiktok` or `movie` style. Idea in, post-ready MP4 out, one command. Most platforms leave both steps to you.

Prepaid credits, no subscription. Failed runs refund automatically. Outputs live on permanent CDN URLs.

**[Create an account →](https://getagenthook.com/signup)**

## License

CLI and skill are Apache-2.0. The hosted service is a commercial product.
