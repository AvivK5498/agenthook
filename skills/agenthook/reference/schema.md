# Tool schema reference

**This is a snapshot. The live endpoint is authoritative** — parameters, enums, and defaults can change:

```bash
agenthook tools --json          # or: curl https://getagenthook.com/api/v1/tools
```

`GET /api/v1/tools` is **public** — no API key required, so an unauthenticated agent can read the live schema before login. If anything here disagrees with it, the live endpoint wins. Every tool maps to `POST /api/v1/tools/<tool>/run` and the CLI's `agenthook run <tool>`. The server re-validates authoritatively; the CLI pre-validates the same rules locally so bad params never reach a paid path.

## make_video

Generate a video (talking-head parity via Seedance native audio) from a prompt and optional reference images. Put the spoken line in `prompt`.

| param | type | required | default | values / notes |
|-------|------|----------|---------|----------------|
| `prompt` | string | yes | — | max 4000 chars (seedance-2); 2500 for kling-3 |
| `model` | string | no | `seedance-2` | `seedance-2`, `kling-3` |
| `quality` | string | no | `standard` | `standard` (720p), `pro` (1080p) |
| `duration` | number | no | `5` | seconds — server-enforced per model: `4, 5, 6, 8, 10, 12, 15` (seedance-2); `3, 5, 8, 10, 15` (kling-3) |
| `aspect_ratio` | string | no | `9:16` | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9` |
| `audio` | boolean | no | `true` | CLI: `--no-audio` to mute |
| `captions` | boolean | no | `false` | burns captions in-run (+15 credits) |
| `caption_style` | string | no | `tiktok` | `movie`, `tiktok` |
| `reference_images` | string[] | no | — | up to 14 URLs; requires `owns_references: true` |
| `owns_references` | boolean | no | — | must be `true` when `reference_images` present (likeness consent) |
| `enhance_prompt` | boolean | no | `false` | improves the result from a short prompt (+3 credits) |
| `influencer` | string | no | — | slug of a saved influencer; server attaches its portrait+sheet as refs and prepends its appearance to the prompt. Seedance adds the +10% ref surcharge; kling caps user refs at 2 alongside it (4 total). Unknown slug → `400`, no debit |

CLI flags: `--prompt`, `--model`, `--quality`, `--duration`, `--aspect-ratio`, `--no-audio`, `--captions`, `--caption-style`, `--ref <url>` (repeatable), `--owns-references`, `--enhance-prompt`, `--influencer <slug>`.

## make_image

Generate or edit an image. With `reference_images` it routes to Nano Banana 2; without, to GPT Image 2.

| param | type | required | default | values / notes |
|-------|------|----------|---------|----------------|
| `prompt` | string | yes | — | — |
| `model` | string | no | `auto` | `auto`, `nano-banana-2`, `gpt-image-2` |
| `aspect_ratio` | string | no | `9:16` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `21:9` |
| `resolution` | string | no | `1k` | `1k`, `2k`, `4k` (affects Nano Banana 2) |
| `count` | number | no | `1` | 1–4 |
| `reference_images` | string[] | no | — | up to 14 URLs; requires `owns_references: true` |
| `owns_references` | boolean | no | — | must be `true` when `reference_images` present |
| `enhance_prompt` | boolean | no | `false` | +3 credits |
| `influencer` | string | no | — | slug of a saved influencer; server attaches its portrait+sheet as refs and prepends its appearance to the prompt. Unknown slug → `400`, no debit |

CLI flags: `--prompt`, `--model`, `--aspect-ratio`, `--resolution`, `--count`, `--ref <url>` (repeatable), `--owns-references`, `--enhance-prompt`, `--influencer <slug>`.

## caption_video

Burn styled subtitles into an existing video; returns the captioned video plus a transcript.

| param | type | required | default | values / notes |
|-------|------|----------|---------|----------------|
| `video_url` | string | yes | — | URL of the source video |
| `style` | string | no | `movie` | `movie`, `tiktok` |
| `language` | string | no | `auto` | ISO code or `auto` |

CLI flags: `--video-url`, `--style`, `--language`.

## create_influencer

Create a reusable, account-bound character: a hero portrait + a composite multi-view character sheet. Flat 20 credits. Give a short idea for `prompt` and a `name`. On success, `output[0]` is the portrait and `output[1]` the character sheet, both saved to the account.

| param | type | required | default | values / notes |
|-------|------|----------|---------|----------------|
| `prompt` | string | yes | — | a short idea describing the character |
| `name` | string | yes | — | display name, 1–60 chars |
| `slug` | string | no | derived from `name` | lowercase `[a-z0-9-]`, ≤40; the handle for `--influencer`; unique per account (collision → `409`) |

CLI flags: `--prompt`, `--name`, `--slug`. Use the saved influencer with `--influencer <slug>` on `make_video` / `make_image`.

### Managing influencers

Not run-based — direct endpoints keyed by the API key (max 100 per account):

| method | endpoint | CLI | notes |
|--------|----------|-----|-------|
| GET | `/v1/influencers` | `agenthook influencers` | list slug, name, portrait/sheet URLs, appearance |
| DELETE | `/v1/influencers/<slug>` | `agenthook influencers:delete <slug>` | removes the saved asset; already-generated media URLs keep working |

## Run lifecycle

`POST /api/v1/tools/<tool>/run` returns `202` with `{ run_id, status: "queued", credits_charged }`. Poll `GET /api/v1/runs/<run_id>` (states: `queued` → `processing` → `completed` | `failed`). A `completed` run carries `output` (an array of permanent CDN URLs) and, for `caption_video`, a `transcript`. A `failed` run carries `error` and is auto-refunded.

Pass an `Idempotency-Key: <uuid>` header on run creation so a retried submit returns the original run without a second debit. The `agenthook run` CLI generates and reuses this key automatically (no flag to pass); with raw `curl` you set the header yourself.

## Free pre-flight (`dry_run`)

Send `"dry_run": true` in the run body (CLI: `agenthook run <tool> … --dry-run`) to validate and **price** a request without creating a run or charging credits. The server responds `200` with `{ "dry_run": true, "valid": true, "model": "<m>", "credits_required": <n> }` instead of `202`; no `run_id` is created and nothing is debited. The CLI prints `Would cost <n> credits (model <m>). No credits charged.` (or the raw JSON object under `--json`) and exits `0`; a request that fails validation still returns `400` / exit `3`. Use it to check price and validity before spending.
