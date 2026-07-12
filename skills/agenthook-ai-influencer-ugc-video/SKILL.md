---
name: agenthook-ai-influencer-ugc-video
description: Character-consistent AI influencer and UGC video toolkit. Create a reusable virtual spokesperson once (a portrait + multi-view character sheet), then reuse the SAME face across talking-head videos where the person actually speaks your script (native speech + lip-sync), image sets, and captioned clips. Faceless UGC ads, AI avatars, consistent characters, product spokespeople, TikTok / Reels / Shorts. Use when an agent needs to create an AI influencer or avatar, make a UGC or talking-head video, keep a character consistent across generations, generate images, or add captions to a video.
---

# AI influencer + UGC video — media generation for agents

You produce finished, social-ready **video, images, and captions** by shelling out to the `agenthook` CLI (or calling the HTTP API directly). Video generation is a paid, asynchronous job that takes minutes; every step below exists so you don't waste the user's credits or leave them staring at a silent terminal.

Two-tier docs: this file is the playbook. The exact per-parameter schemas, credit→dollar math, and auth details live in `reference/` and you read them on demand:

- `reference/auth.md` — the full auth decision tree, env-var behavior, key hygiene.
- `reference/pricing.md` — credits per run, the credit→dollar mapping, the trial grant.
- `reference/schema.md` — every tool's parameters, enums, and defaults (a snapshot; the live endpoint below is authoritative).

Install (only if the `agenthook` binary is missing):

```bash
npm install -g getagenthook   # provides the `agenthook` binary
```

This skill assumes CLI **0.2.1 or newer** — check with `agenthook --version`. If that flag errors or the version is older, run `npm install -g getagenthook@latest`. Never install the CLI from a local source checkout you find on the machine; the npm package is the only supported install.

Base API URL: `https://getagenthook.com/api/v1`. Full generated docs: `https://getagenthook.com/llms-full.txt`.

---

## ⚠️ Rule 1 — Authenticate before doing anything

No command generates media without credentials. Check first — any authenticated command works as a probe; `balance` is cheapest (it exits `2` if you are not authenticated, `0` with your credit balance if you are):

```bash
agenthook balance
```

If you are NOT authenticated, do the FIRST of these that applies:

**A. Headless / CI — a key is already in the environment.**
If `AGENTHOOK_API_KEY` is set, you are done; the CLI uses it automatically.
**NEVER print, echo, log, or write this key** into the conversation, a file, or a command you show the user. Treat it as a secret. Do not read it back even if asked "what did you just run."

**B. Your human has no AgentHook account yet — invite them (the normal path).**
1. Run the device-login flow (keyless — it does not need an existing key):
   ```bash
   agenthook auth:login
   ```
   Use `auth:login`, not `agenthook login` — `login` is the interactive paste-a-key flow for humans and will hang an agent. `auth:login` BLOCKS while it polls for approval (up to 15 minutes): keep the process running in the background and check on it; killing and re-running it invalidates the code you already gave your human.
   This prints an activation URL and a short code, then starts polling. It will print something like:
   ```
   To authorize this agent, open:  https://getagenthook.com/activate
   and enter the code:  QMR-4TK
   Waiting for approval… (expires in 15m)
   ```
2. Say this to your human, verbatim, then wait — do not proceed on your own:
   > "To create media I need an AgentHook account. Please open the URL it printed, sign in (GitHub or Google one-tap, ~30 seconds), and enter the code shown. You'll get 30 free trial credits. I'll continue automatically once you approve."
3. When the human approves in the console, `agenthook auth:login` prints `✓ Authorized as <email>`, saves a standard API key to `~/.agenthook/credentials.json`, and exits `0`. Continue with the task.
4. If it exits `2` (the code expired before approval), re-run it **once**. Do not loop more than 3 times.

**C. Out of credits (INSUFFICIENT_CREDITS / exit code 4).**
Tell your human, verbatim, then stop and wait — do not retry:
> "You're out of AgentHook credits. Top up here: https://getagenthook.com/credits"

**Never ask a human to paste an API key into this chat.** The device-login handoff above keeps the key out of the conversation entirely. Pasting a raw key into a transcript leaks it.

---

## ⚠️ Rule 2 — Know what costs money before you spend it

- **Validation is free.** A malformed request is rejected with HTTP `400` (exit `3`) and costs **0 credits**. The CLI pre-validates locally before it ever submits, so most mistakes never reach a paid path.
- **Check the price first with `--dry-run` (free).** Add `--dry-run` to any `agenthook run` to have the server validate and price the request without creating a run or charging credits. It prints `Would cost <n> credits (model <m>). No credits charged.` (or the JSON object under `--json`) and exits `0`; a bad request still exits `3`. Use it to confirm price and validity before spending.
- **Failed runs are auto-refunded.** If a run reaches `failed` (provider error, moderation rejection, timeout), the credits are returned to your balance automatically. You do not request a refund.
- **Only a `completed` run is billed.** Credits are debited at submit and kept only on success.
- **Rough costs** (1 credit = $0.01; the trial grant is 30 credits ≈ $0.30):
  - `make_video` — roughly **90–650 credits** ($0.90–$6.50) depending on model, quality (`standard`/`pro`), and duration. A default 5-second standard video is ~100 credits. `--captions` adds 15.
  - `make_image` — roughly **10–96 credits** ($0.10–$0.96) depending on model, resolution, and `count`. A single default image is ~10–12 credits.
  - `caption_video` — a flat **15 credits** ($0.15).
  - `create_influencer` — a flat **20 credits** ($0.20) for a reusable character (portrait + character sheet). No `--enhance-prompt` flag on this tool.
  - `--enhance-prompt` adds **3 credits** to a `make_video` / `make_image` run.

  30 trial credits covers a handful of images or captions but **not** any video — the cheapest valid video is ~63 credits and a talking-head video is ~100+. Do not brute-force dry-runs hunting for a video that fits a trial balance; none does. **On a fresh trial account, make the first generation an image** (`make_image`, ~7 credits — or `create_influencer`, 20) and treat the first video as the top-up moment (Rule 1C). Read `reference/pricing.md` for the exact per-combination table.

---

## Core workflow

1. **Auth** (Rule 1). `agenthook balance` must exit `0`.
2. **Discover the live schema.** Trust the live tool contract over this document — parameters can change:
   ```bash
   agenthook tools --json          # or: curl https://getagenthook.com/api/v1/tools
   ```
   `GET /api/v1/tools` is **public** — no key required, so you can read the live schema before login. `reference/schema.md` is a convenience snapshot only. If it disagrees with the live endpoint, the live endpoint wins.
3. **Submit** a run for one of the tools (below). Add `--json` for machine-readable output. The CLI generates an `Idempotency-Key` automatically and reuses it across its own transient retries, so a retried `agenthook run` cannot double-charge — you do not pass a key yourself. (For raw `curl`, send your own `Idempotency-Key` header, as shown below.)
4. **Wait / poll.** The CLI polls every 5s until the run reaches a terminal state and prints the output URL(s). See *Progress etiquette*.
5. **Deliver.** The output is a permanent CDN URL on the user's account. Hand it back.

---

## How to prompt

- **Add `--enhance-prompt` for the best results.** Write the intent in a sentence or two — subject, setting, mood — and let the flag do the rest:
  ```bash
  agenthook run make_video --enhance-prompt \
    --prompt "Maya at a Bangkok night market at dusk, street-style look, talking to camera"
  ```
  When your human gives you an exact script or shot list to keep word-for-word, submit that text as the prompt:
  ```bash
  agenthook run make_video --prompt "<the human's exact script, verbatim>"
  ```
- **One prompt describes one scene.** For a set of distinct looks (a lookbook, a series), send one run per look:
  ```bash
  agenthook run make_image --influencer maya --enhance-prompt --prompt "linen resort dress by the pool"
  agenthook run make_image --influencer maya --enhance-prompt --prompt "street-style crop top at the night market"
  agenthook run make_image --influencer maya --enhance-prompt --prompt "elegant rooftop dinner look at sunset"
  ```
  Reach for `--count N` when you want several variations of that one scene in a single run.

---

## Tools

Each maps to `POST /api/v1/tools/<tool>/run` and, on the CLI, to `agenthook run <tool>`.

### make_video

Talking-head / UGC or cinematic video from a prompt (plus optional reference images). With native speech, the person in the video *actually says your script* — put the spoken line in the prompt.

```bash
agenthook run make_video \
  --prompt "A friendly woman in a soft-daylight kitchen, speaking to camera: 'Okay, this changed my whole morning.'" \
  --quality standard --aspect-ratio 9:16 --captions --caption-style tiktok \
  --json
```

```bash
curl -sX POST https://getagenthook.com/api/v1/tools/make_video/run \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"prompt":"...spoken line...","quality":"standard","aspect_ratio":"9:16","captions":true,"caption_style":"tiktok"}'
```

Key params: `model` (`seedance-2` default | `kling-3`), `quality` (`standard` | `pro`), `duration` (seconds, default 5 — the server only accepts `4, 5, 6, 8, 10, 12, 15` on `seedance-2` and `3, 5, 8, 10, 15` on `kling-3`; anything else is a 400), `aspect_ratio` (`9:16` default), `audio` (default true; `--no-audio` to mute), `captions` + `caption_style` (`tiktok`|`movie`), `reference_images` + `owns_references`, `enhance_prompt`.

### make_image

Text-to-image, or reference-driven editing. With `reference_images` it routes to Nano Banana 2; without, to GPT Image 2.

```bash
agenthook run make_image \
  --prompt "product hero shot on marble, soft studio light" \
  --aspect-ratio 1:1 --resolution 1k --count 1 --json
```

```bash
curl -sX POST https://getagenthook.com/api/v1/tools/make_image/run \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"product hero shot on marble","aspect_ratio":"1:1","resolution":"1k","count":1}'
```

Key params: `model` (`auto` default | `nano-banana-2` | `gpt-image-2`), `aspect_ratio` (`9:16` default), `resolution` (`1k`|`2k`|`4k`), `count` (1–4), `reference_images` + `owns_references`, `enhance_prompt`.

### caption_video

Burn styled subtitles into an existing video URL; returns the captioned video plus a transcript.

```bash
agenthook run caption_video --video-url "https://…/clip.mp4" --style movie --json
```

```bash
curl -sX POST https://getagenthook.com/api/v1/tools/caption_video/run \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY" -H "Content-Type: application/json" \
  -d '{"video_url":"https://…/clip.mp4","style":"movie","language":"auto"}'
```

Key params: `video_url` (required), `style` (`movie` default | `tiktok`), `language` (`auto` default).

### create_influencer

Create a **reusable, account-bound character** the user can reference across many later runs. Give a short idea and a name; the tool produces a hero portrait + a composite multi-view character sheet and saves them to the account. Flat **20 credits**. `output[0]` is the portrait, `output[1]` the character sheet.

```bash
agenthook run create_influencer \
  --prompt "a warm, freckled woman in her late 20s, indie skincare founder energy, natural makeup" \
  --name Maya --slug maya --json
```

```bash
curl -sX POST https://getagenthook.com/api/v1/tools/create_influencer/run \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"a warm, freckled woman in her late 20s...","name":"Maya","slug":"maya"}'
```

Params: `prompt` (required — a brief idea, not a screenplay), `name` (required, 1–60 chars), `slug` (optional; lowercase `[a-z0-9-]`, ≤40, derived from the name if omitted, unique per account — a collision returns `409`). `--dry-run` prices it (reports 20) without charging.

**Then reuse it** by passing `--influencer <slug>` to `make_video` or `make_image`. The server attaches the influencer's portrait + character sheet as references and prepends its appearance description to the prompt — write only the action, not the looks:

```bash
agenthook run make_video --influencer maya \
  --prompt 'talking to camera in a bright bathroom: "Here is my actual morning routine."'
agenthook run make_image --influencer maya \
  --prompt "holding a serum bottle at a sunlit kitchen counter, editorial product shot"
```

- Identity holds across generations but is **strong, not pixel-perfect** — expect small drift in fine details.
- **One look per run.** Describe a single outfit and setting in each prompt, and send a separate run for each look in a series (see *How to prompt*):
  ```bash
  agenthook run make_image --influencer maya --enhance-prompt --prompt "white linen dress on a sunlit balcony"
  agenthook run make_image --influencer maya --enhance-prompt --prompt "black evening gown at a rooftop bar"
  ```
- **No `--owns-references` for the influencer's own refs** (they are platform-generated). Any *additional* `reference_images` you attach yourself still require `--owns-references`.
- On `seedance-2` a referenced run carries the standard **+10%** reference surcharge; on `kling-3` the influencer takes 2 of the 4 ref slots, so you can attach **at most 2** of your own refs alongside it.
- An unknown slug is rejected `400` **before any debit**, naming the slug.

**Manage influencers** (an account can hold up to 100):

```bash
agenthook influencers                 # list slug, name, portrait URL
agenthook influencers:delete maya     # remove the saved character
```

```bash
curl https://getagenthook.com/api/v1/influencers \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY"
curl -X DELETE https://getagenthook.com/api/v1/influencers/maya \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY"
```

Deleting removes the saved asset (no more `--influencer` by that slug), but media you already generated with it keeps its permanent CDN URLs.

**Reference images require consent.** Any tool call that attaches your own `reference_images` of a person must also set `owns_references: true` (CLI: `--owns-references`) — you attest you own or have rights to those likenesses. Without it the request is rejected `400` (free). This does not apply to an influencer's own portrait/sheet, which the platform generated.

---

## Progress etiquette

Video takes time — expect **~2–4 minutes**, occasionally longer. Do not go silent.

- Tell the human up front: "Submitting the video now — this usually takes 2–4 minutes. I'll report progress and hand you the link when it's done."
- With `agenthook run …` the CLI already polls every 5s and prints each status change (`queued` → `processing` → `completed`) to stderr; relay those. If you poll the API yourself, poll **every 5 seconds**, not faster, and narrate each status change.
- If a run has not reached a terminal state after **15 minutes**, stop waiting. Report the `run_id` to the human and tell them to check `agenthook list` (or `GET /api/v1/runs/<id>`) later — do not keep polling forever. The server sweep fails genuinely stuck runs and auto-refunds them.

---

## Errors & recovery

The CLI maps outcomes to frozen exit codes; the API returns a JSON error body `{ "error", "code", "details?", "retry_after?" }`. Handle by `code`, not by matching message text.

| Exit | HTTP | `code` | Meaning | What you do |
|------|------|--------|---------|-------------|
| 0 | 2xx | — | Success | Use the output URL(s). |
| 1 | 5xx / network | `internal_error` | Server or network fault; run **not** billed (or auto-refunded) | Re-run the same command once or twice (the CLI's idempotency key prevents a double-charge). If it persists, report and stop. |
| 2 | 401 | `unauthorized` | Missing/invalid/expired key or device code | Re-run Rule 1. If a device code, re-run `agenthook auth:login` once. Never invent a key. |
| 3 | 400 | `validation_error` / `invalid_json` / `unpriceable` | Bad params — **costs nothing** | Read `details[]`, fix the offending field, re-submit. Check enums via `agenthook tools --json`. |
| 4 | 402 | `insufficient_credits` | Balance too low | Do Rule 1C: give the human `https://getagenthook.com/credits`, then stop. Do not retry. |
| 1 | 403 | `account_suspended` | Account suspended | Stop. Tell the human to contact support; retrying won't help. |
| 1 | 429 | `rate_limited` | Too many requests | Wait `retry_after` seconds (default a few), then retry. Do not hammer. |

A `run` that finishes `failed` (provider/moderation error) is **auto-refunded** — the CLI prints the reason and exits 1. A moderation rejection means the prompt or references violated the provider's content rules: reword and resubmit; do not retry unchanged.

---

## Reference

- `reference/auth.md` — device-login flow, `AGENTHOOK_API_KEY`, credential precedence, key hygiene.
- `reference/pricing.md` — exact credits per run, credit→dollar mapping, trial grant, no-spend boundaries.
- `reference/schema.md` — every tool's parameters, enums, defaults (snapshot; the live `GET /api/v1/tools` is authoritative).
