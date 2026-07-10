import { balance } from "./commands/balance";
import { history } from "./commands/history";
import { list } from "./commands/list";
import { login } from "./commands/login";
import { run } from "./commands/run";
import { tools } from "./commands/tools";
import { ApiError, describeApiError } from "./http";

const USAGE = `agenthook — hosted media generation for agents

Usage: agenthook <command> [flags]

Commands:
  login [--key <key>]                     store your API key (chmod 600)
  tools                                   list tools + parameters (from GET /v1/tools)
  run <tool> [flags]                      submit a run, poll every 5s, print output URL(s)
  list [--tool t] [--status s] [--search q]   your past generations
  balance                                 credit balance
  history                                 credit ledger

Run flags:
  --prompt <text>  --ref <url> (repeatable)  --owns-references  --model <m>
  --quality <standard|pro>  --duration <s>  --aspect-ratio <r>  --no-audio
  --captions  --caption-style <movie|tiktok>  --enhance-prompt
  --video-url <url>  --style <movie|tiktok>  --count <n>  --resolution <1k|2k|4k>

Every command accepts --api-url <url> (or AGENTHOOK_API_URL; default https://getagenthook.com).`;

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "login":
        return await login(rest);
      case "tools":
        return await tools(rest);
      case "run":
        return await run(rest);
      case "list":
        return await list(rest);
      case "balance":
        return await balance(rest);
      case "history":
        return await history(rest);
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
      return 1;
    }
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
