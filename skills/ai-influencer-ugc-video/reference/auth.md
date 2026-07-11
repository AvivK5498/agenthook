# Authentication reference

Read this when `SKILL.md` Rule 1 isn't enough — the full auth decision tree, how credentials resolve, and how to keep the key out of the transcript.

## The one rule that never bends

**Never print, echo, log, or write an API key into the conversation, a file, or a command you display.** Keys leak when an agent reads them back ("here's the command I ran: `--key ah_live_…`") or writes them into a script. The device-login flow below exists specifically so the key never touches the chat. If the user asks to see the key, decline and point them at the console at `https://getagenthook.com` instead.

## Check status first

```bash
agenthook balance
```

Any authenticated command works as a probe; `balance` is the cheapest. Exit `0` = authenticated (prints your credit balance). Exit `2` = no valid credentials → pick a path below.

Schema discovery is the one exception that needs **no** credentials: `agenthook tools` (`GET /api/v1/tools`) is public, so an unauthenticated agent can read the live tool schema before login. Everything that spends — running a tool, checking a balance — still requires a key.

## Path A — headless / CI (a key already in the environment)

If `AGENTHOOK_API_KEY` is set, every CLI command uses it automatically; you are done. This is the path for CI pipelines, cron jobs, and any environment where a human has pre-provisioned a key as a secret. Do not print it, do not copy it into a config you show the user.

## Path B — device login (the normal cold-start path)

Your human has no account, or no key is present. Use the browser handoff — no key ever transits the chat:

```bash
agenthook auth:login
```

It creates a short-lived device session (`POST /api/v1/device`), prints an activation URL + a short `XXX-XXX` code, and polls `GET /api/v1/device/<poll_token>` every few seconds:

```
To authorize this agent, open:  https://getagenthook.com/activate
and enter the code:  QMR-4TK
Waiting for approval… (expires in 15m)
```

The human opens the URL, signs in (GitHub or Google one-tap, or email — all live), enters the code, and approves. New accounts get **30 trial credits** at signup. On approval the server mints a standard API key, hands it to the CLI **once**, and `auth:login` saves it to `~/.agenthook/credentials.json` (chmod 600) and prints:

```
✓ Authorized as user@example.com
```

Exit `0` → continue. Exit `2` → the code expired (≤15 min) before approval, or the poll token was already claimed; re-run `agenthook auth:login` once. Do not loop more than 3 times.

The minted key shows up in the console's **API keys** page named `agent-<YYYY-MM-DD>` and can be revoked there like any key. It is a normal, long-lived key — the device flow is just a safe delivery channel, not a different key type.

## Credential precedence

Every command resolves the key in this order (first match wins):

1. `--key <key>` flag on the command
2. `AGENTHOOK_API_KEY` environment variable
3. `~/.agenthook/credentials.json` (written by `auth:login` / `login`)

The API URL resolves similarly: `--api-url` flag > `AGENTHOOK_API_URL` env > stored `api_url` > default `https://getagenthook.com`.

## Raw HTTP auth

Direct API calls use a bearer header:

```bash
curl -s https://getagenthook.com/api/v1/me \
  -H "Authorization: Bearer $AGENTHOOK_API_KEY"
```

`GET /api/v1/me` returns `{ user_id, balance, suspended }` — a cheap way to confirm a key works and check the credit balance.

## What NOT to do

- Do **not** ask the human to paste a key into the chat. Use Path B.
- Do **not** create keys yourself or scrape them from the console UI. The device flow is the only agent-facing minting path.
- Do **not** retry on `401` (`unauthorized`, CLI exit 2) by guessing a key. Re-run the device flow.
