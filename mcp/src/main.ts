#!/usr/bin/env node
// Bin entry for `npx -y @getagenthook/mcp`. All diagnostics go to stderr —
// stdout carries ONLY JSON-RPC frames on stdio.
import { startServer } from "./server.js";

startServer().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
