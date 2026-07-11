<div align="center">

# AgentHook

**Your agent's video studio. One CLI.**

Generate UGC video, images, and captioned clips from Claude Code, Cursor, n8n, or any agent that can run a shell command.

[![npm](https://img.shields.io/badge/npm-getagenthook-c6fe1e?style=flat-square)](https://www.npmjs.com/package/getagenthook)
[![license](https://img.shields.io/badge/license-Apache--2.0-green?style=flat-square)](./LICENSE)

</div>

---

Your agent can write code, browse the web, and manage your calendar. It can also ship finished, social-ready video. That part is new.

## Get started: paste this into your agent

```text
Install the agenthook skill by running: npx skills add AvivK5498/agenthook --yes
Then follow the skill to set up AgentHook and make me a test video.
```

That's the whole setup. The skill teaches your agent the rest: how to authenticate without pasting a key into your chat (it sends you a link to approve instead), how to check what a run costs before spending, and how to turn a one-line idea into an MP4:

```bash
agenthook run make_video \
  --prompt "A friendly woman in her late 20s, soft daylight kitchen, speaking to camera: 'Okay, this changed my whole morning routine. You have to try it.'" \
  --quality standard --captions --caption-style tiktok
# → https://…/users/you/runs/…/0.mp4  (vertical, spoken, subtitled, ready to post)
```

There is no timeline editor in this workflow and no designer waiting on a brief. The agent submits, polls, and hands you a URL.

## What your agent gets

- **`make_video`** turns text (plus optional reference images) into talking-head or cinematic video with native speech. The person in your video actually says your script.
- **`make_image`** does text-to-image and reference-driven editing.
- **`caption_video`** takes any video URL and returns it with styled burned-in captions (`movie` or `tiktok`) and the full transcript.
- **`--enhance-prompt`** rewrites a rough one-liner into a director-grade prompt before generating.
- **`list --search`** searches your generation history in plain words. "that beach video from last week" finds it.

## Built for agents, not dashboards

The CLI validates input locally against the live tool schemas, so a malformed request fails in milliseconds instead of after a paid render. Add `--dry-run` to any generation and the server prices it for free before you commit. Billing is prepaid credits with no subscription, and a failed generation refunds its credits automatically. Outputs land on permanent CDN URLs under your account and stay there.

One rule worth knowing up front: using a reference image of a real person requires an explicit rights attestation (`--owns-references`), and that attestation is recorded with the generation.

## Where it runs

Anywhere a shell works:

```text
You: "Make a TikTok about our pricing launch and give me the link."
Agent: runs agenthook, returns the finished MP4.
```

Claude Code, Cursor, Windsurf, n8n, cron jobs, CI pipelines.

## The skill

The paste-into-your-agent line above installs this repo's agent skill from [skills.sh](https://skills.sh/AvivK5498/agenthook). It covers auth, pricing, polling etiquette, and error handling. Read [`skills/agenthook/SKILL.md`](./skills/agenthook/SKILL.md) to see exactly what your agent will be told.

[![skills.sh](https://skills.sh/b/AvivK5498/agenthook)](https://skills.sh/AvivK5498/agenthook)

If you'd rather skip the skill: `npm i -g getagenthook`, then `agenthook auth:login`.

## Docs

Full docs at [agenthook.mintlify.app](https://agenthook.mintlify.app). Agents can read the whole API contract at [getagenthook.com/llms-full.txt](https://getagenthook.com/llms-full.txt), and `agenthook tools` prints every tool and argument straight from the live API.

## License

The CLI and skill pack are Apache-2.0. The hosted generation service is a commercial product. [Create an account](https://getagenthook.com/signup) to get an API key and trial credits.
