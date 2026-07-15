import { authLogin } from "./commands/auth-login";
import { balance } from "./commands/balance";
import { history } from "./commands/history";
import { influencers, influencersDelete } from "./commands/influencers";
import { jobs } from "./commands/jobs";
import { list } from "./commands/list";
import { login } from "./commands/login";
import { run } from "./commands/run";
import { tools } from "./commands/tools";
import { exitCodeForApiError } from "./exit";
import { ApiError, describeApiError } from "./http";
import { VERSION } from "./version";

const USAGE = `agenthook — hosted media generation for agents

Usage: agenthook <command> [flags]

Commands:
  auth:login                              keyless device flow — approve in the console
  login [--key <key>]                     keyless device flow, or store a pasted key
  tools                                   list tools + parameters (from GET /v1/tools)
  run <tool> [flags]                      submit a run, poll every 5s, print output URL(s)
  list [--tool t] [--status s] [--search q]   your past generations
  influencers                             list your saved influencers (slug / name / portrait)
  influencers:delete <slug>               delete a saved influencer
  balance                                 credit balance
  history                                 credit ledger
  jobs                                    local run ledger (~/.agenthook/jobs.jsonl)
  version                                 print the CLI version (also --version / -v)

Run flags:
  --prompt <text>  --ref <url> (repeatable)  --owns-references  --model <m>
  --quality <standard|pro>  --duration <s>  --aspect-ratio <r>  --no-audio
  --captions  --caption-style <chunk|highlight|subtitle>  --caption-size <small|medium|large>
  --caption-placement <top|center|bottom>  --enhance-prompt
  --video-url <url>  --style <chunk|highlight|subtitle>  --size <small|medium|large>
  --placement <top|center|bottom>  --count <n>  --resolution <1k|2k|4k>
  --dry-run        price + validate against the server without spending credits

Auth: pass --key, set AGENTHOOK_API_KEY, or run auth:login (precedence: flag > env > file).
--json on run/list/balance/history/tools/jobs emits machine JSON on stdout, progress on stderr.
Every command accepts --api-url <url> (or AGENTHOOK_API_URL; default https://getagenthook.com).`;

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "auth:login":
        return await authLogin(rest);
      case "login":
        // Keyless `login` falls through to the device flow; `login --key <k>`
        // keeps the paste path (still supported for CI/pre-provisioned keys).
        return rest.includes("--key") ? await login(rest) : await authLogin(rest);
      case "tools":
        return await tools(rest);
      case "run":
        return await run(rest);
      case "list":
        return await list(rest);
      case "influencers":
        return await influencers(rest);
      case "influencers:delete":
        return await influencersDelete(rest);
      case "balance":
        return await balance(rest);
      case "history":
        return await history(rest);
      case "jobs":
        return await jobs(rest);
      case "version":
      case "--version":
      case "-v":
        // Agents probe this to detect a stale install — must exit 0 with the
        // package version, never fall through to "Unknown command" (exit 1).
        console.log(VERSION);
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(USAGE);
        return cmd === undefined ? 1 : 0;
      default:
        console.error(`Unknown command "${cmd}".\n\n${USAGE}`);
        return 1;
    }
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(describeApiError(e));
      return exitCodeForApiError(e);
    }
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
