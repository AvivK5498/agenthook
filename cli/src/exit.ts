// Frozen exit-code taxonomy (spec §5). Agents branch on these; never renumber.
import { ApiError } from "./http";

export const EXIT = {
  OK: 0,
  GENERIC: 1, // any uncategorized failure (network, bad args, run failed)
  AUTH: 2, // 401/403, and a device session that expired/was already claimed
  VALIDATION: 3, // 400 — malformed request the server rejected
  INSUFFICIENT_CREDITS: 4, // 402 — out of credits (carries top_up_url in --json)
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Maps an ApiError's HTTP status onto the frozen taxonomy. Status 0
 * (network/timeout) and everything unmapped fall through to GENERIC. */
export function exitCodeForApiError(e: ApiError): ExitCode {
  switch (e.status) {
    case 401:
    case 403:
      return EXIT.AUTH;
    case 400:
      return EXIT.VALIDATION;
    case 402:
      return EXIT.INSUFFICIENT_CREDITS;
    default:
      return EXIT.GENERIC;
  }
}
