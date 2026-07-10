<div align="center">

# AgentHook

**Your agent's video studio. One CLI.**

Generate scroll-stopping UGC video, images, and captioned clips from Claude Code, Cursor, n8n — or any agent that can run a shell command.

[![npm](https://img.shields.io/badge/npm-agenthook-c6fe1e?style=flat-square)](https://www.npmjs.com/package/agenthook)
[![license](https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square)](./LICENSE)

</div>

---

Your agent can write code, browse the web, and manage your calendar. Now it can ship **finished, social-ready video**.

```bash
npm i -g agenthook
agenthook login
agenthook run make_video \
  --prompt "A friendly woman in her late 20s, soft daylight kitchen, speaking to camera: 'Okay — this changed my whole morning routine. You have to try it.'" \
  --quality standard --captions --caption-style tiktok
# → https://…/users/you/runs/…/0.mp4  (vertical, spoken, subtitled — ready to post)
```

That's the whole workflow. No timeline editor, no rendering farm, no designer in the loop.

## What your agent gets

- 🎬 **`make_video`** — text (plus optional reference images) to talking-head or cinematic video. Native speech: the person in your video *actually says your script*.
- 🖼️ **`make_image`** — production-grade stills, text-to-image or reference-driven editing.
- 💬 **`caption_video`** — hand it any video URL, get it back with styled burned-in captions (`movie` or `tiktok`) plus the full transcript.
- ✨ **`--enhance-prompt`** — a rough one-liner goes in, a director-grade prompt comes out. Your intent, sharpened.
- 🔎 **`list --search`** — your whole generation history, searchable in plain words. "that beach video from last week" just works.

## Built agent-first

- **One API, self-describing.** The CLI validates everything locally against live tool schemas — your agent finds out about a mistake in milliseconds, not after a paid render.
- **Prepaid credits, honest billing.** Failed generation? Credits back, instantly and automatically. No subscription required.
- **Own your outputs.** Every result lands on permanent CDN URLs under your account. Nothing expires, nothing is held hostage.
- **Consent built in.** Using a reference image of a person requires an explicit rights attestation — the flag is recorded with every generation.

## Install in your agent

Works anywhere a shell works:

```text
You: "Make a TikTok about our pricing launch and give me the link."
Agent: runs agenthook, returns the finished MP4.
```

Claude Code, Cursor, Windsurf, n8n, cron jobs, CI pipelines — if it can execute a command, it can produce video. MCP server and Claude Skill pack: coming next.

## Docs

Full quickstart, tool reference, and API docs: **[getagenthook.com](https://getagenthook.com) — and** — until then, `agenthook tools` prints every tool and argument straight from the API.

## License

The CLI and skill pack are Apache-2.0. The hosted generation service is a commercial product — [create an account](https://getagenthook.com/signup) to get an API key and trial credits.
