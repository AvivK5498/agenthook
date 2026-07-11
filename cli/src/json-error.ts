// Shared --json error emission for the read commands (list/balance/history/
// tools). Under --json a failing request must put a machine-readable error on
// stdout (not stderr) and exit with the frozen code; 402 carries top_up_url.
import { EXIT, exitCodeForApiError, type ExitCode } from "./exit";
import { ApiError } from "./http";

export function topUpUrl(apiUrl: string): string {
  return `${apiUrl}/credits`;
}

/** Runs `body`; on ApiError under --json, emits the JSON error payload to
 * stdout and returns the mapped exit code. Non-json failures re-throw so the
 * cli.ts dispatcher renders them to stderr with the same code. */
export async function guardJson(
  asJson: boolean,
  apiUrl: string,
  body: () => Promise<ExitCode>,
): Promise<ExitCode> {
  try {
    return await body();
  } catch (e) {
    if (asJson && e instanceof ApiError) {
      const code = exitCodeForApiError(e);
      const payload: Record<string, unknown> = { error: e.message, exit_code: code };
      if (e.code) payload.code = e.code;
      if (code === EXIT.INSUFFICIENT_CREDITS) payload.top_up_url = topUpUrl(apiUrl);
      console.log(JSON.stringify(payload));
      return code;
    }
    throw e;
  }
}
