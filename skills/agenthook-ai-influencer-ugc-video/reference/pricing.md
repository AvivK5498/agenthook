# Pricing reference

Credits are prepaid. **1 credit = $0.01.** Signup grants **30 trial credits (≈ $0.30)** one time. Top up at `https://getagenthook.com/credits`.

Check your balance any time:

```bash
agenthook balance --json          # or: curl -H "Authorization: Bearer $AGENTHOOK_API_KEY" https://getagenthook.com/api/v1/me
```

## No-spend boundaries

- **Validation costs nothing.** A rejected request (`400` / exit 3) never debits. The CLI pre-validates locally, so most mistakes are free and instant.
- **Failed runs are auto-refunded.** Provider errors, moderation rejections, and stuck-run timeouts return the credits automatically. You never file a refund.
- **Only `completed` runs are billed.** Credits debit at submit and are kept only on success.

## Credit cost per run

Costs are derived from model, quality/resolution, duration, and count. The numbers below are representative points from the live pricing function — always confirm the live balance and let the API be the source of truth for the exact charge (it is returned as `credits_charged` on submit).

### make_video (≈ 90–650 credits / $0.90–$6.50)

| model | quality | duration | credits | ≈ $ |
|-------|---------|----------|---------|-----|
| seedance-2 | standard | 5s | 100 | $1.00 |
| seedance-2 | standard | 10s | 200 | $2.00 |
| seedance-2 | pro | 5s | 313 | $3.13 |
| seedance-2 | pro | 10s | 625 | $6.25 |
| kling-3 | standard | 5s | 94 | $0.94 |
| kling-3 | standard | 10s | 188 | $1.88 |
| kling-3 | pro | 5s | 125 | $1.25 |
| kling-3 | pro | 10s | 250 | $2.50 |

Add-ons: `--captions` adds **15 credits** ($0.15); `--enhance-prompt` adds **3 credits** ($0.03).

### make_image (≈ 10–96 credits / $0.10–$0.96)

| model | count | resolution | credits | ≈ $ |
|-------|-------|------------|---------|-----|
| gpt-image-2 | 1 | (n/a) | 10 | $0.10 |
| gpt-image-2 | 4 | (n/a) | 39 | $0.39 |
| nano-banana-2 | 1 | 1k | 12 | $0.12 |
| nano-banana-2 | 1 | 4k | 24 | $0.24 |
| nano-banana-2 | 4 | 1k | 48 | $0.48 |
| nano-banana-2 | 4 | 4k | 96 | $0.96 |

(`nano-banana-2` is used when `reference_images` are attached; `gpt-image-2` when they are not. `resolution` only affects Nano Banana 2.) `--enhance-prompt` adds 3 credits.

### caption_video

Flat **15 credits** ($0.15) per video, regardless of length.

### create_influencer

Flat **20 credits** ($0.20) per influencer, regardless of the prompt — the hero portrait and the multi-view character sheet are both included, and there is no `enhance_prompt` add-on on this tool. Deliberately priced so a trial account can create a character and still generate images of it. `--dry-run` reports 20. Reusing an influencer via `--influencer` on `make_video` / `make_image` is priced as the underlying run (a `seedance-2` referenced run carries the standard +10% reference surcharge).

## What 30 trial credits buys

The trial grant (~$0.30) covers **a couple of images, one captioned clip, or one influencer** (`create_influencer` is 20 credits, leaving 10 to generate an image of it) — but it is **not** enough for a full standard video (~100 credits). Expect to invite the human to top up (`https://getagenthook.com/credits`) before the first video generation. When a run would exceed the balance the API returns `402` / `insufficient_credits` (CLI exit 4) **before** debiting — nothing is charged.
