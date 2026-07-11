import * as os from "node:os";
import { parseArgs } from "../args";
import { loadCredentials, resolveApiUrl, saveCredentials } from "../config";
import { EXIT } from "../exit";
import { api, ApiError } from "../http";
import type { DevicePollResponse, DeviceSessionCreateResponse } from "../types";

// Poll cadence: 5s (spec); AGENTHOOK_POLL_MS override mirrors run.ts:30.
const pollIntervalMs = () => Number(process.env.AGENTHOOK_POLL_MS || 5000);

// Keyless device flow: create a session, print the approved shape verbatim,
// poll until a human approves in the console, then save the minted key.
// `requesting_host = os.hostname()` so the approve screen can name the agent.
export async function authLogin(argv: string[]): Promise<number> {
  const { flags, errors } = parseArgs(argv, { "api-url": "string" });
  if (errors.length) {
    errors.forEach((e) => console.error(e));
    return EXIT.GENERIC;
  }
  const apiUrlFlag = flags["api-url"] as string | undefined;
  const apiUrl = resolveApiUrl(apiUrlFlag);

  let session: DeviceSessionCreateResponse;
  try {
    session = await api<DeviceSessionCreateResponse>(apiUrl, "/device", {
      method: "POST",
      body: { requesting_host: os.hostname() },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Could not start authorization against ${apiUrl}: ${e.message}`);
      return e.status === 401 || e.status === 403 ? EXIT.AUTH : EXIT.GENERIC;
    }
    throw e;
  }

  // Approved output shape (verbatim — AC1). Human-facing, so it goes to stdout.
  console.log(
    "To authorize this agent, ask your human to visit:\n\n" +
      `    ${session.device_url}\n` +
      `    and enter code:  ${session.user_code}\n\n` +
      "Waiting for approval… (expires in 15m)",
  );

  // Poll GET /device/:pollToken until terminal. A network blip is retried
  // silently until the code expires server-side (poll returns `expired`).
  for (;;) {
    await sleep(pollIntervalMs());
    let poll: DevicePollResponse;
    try {
      poll = await api<DevicePollResponse>(apiUrl, `/device/${encodeURIComponent(session.poll_token)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        console.error("Device session not found — it may have expired. Run `agenthook auth:login` again.");
        return EXIT.AUTH;
      }
      continue; // transient — keep polling until the server reports terminal state
    }

    switch (poll.status) {
      case "pending":
        continue;
      case "approved": {
        const creds = {
          ...loadCredentials(),
          api_key: poll.api_key,
          ...(apiUrlFlag ? { api_url: apiUrl } : {}),
        };
        const p = saveCredentials(creds);
        console.log(`✓ Authorized as ${poll.email}\n  Key saved to ${p}`);
        return EXIT.OK;
      }
      case "expired":
        console.error("The authorization code expired before it was approved. Run `agenthook auth:login` again.");
        return EXIT.AUTH;
      case "claimed":
        console.error("This authorization code was already used. Run `agenthook auth:login` again.");
        return EXIT.AUTH;
    }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
