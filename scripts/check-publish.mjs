#!/usr/bin/env node
// Refuses `npm publish` while the built default Supabase key is not ChainHint's
// sb_publishable_ key (placeholder, legacy anon JWT, secret key). Runs from prepublishOnly.
import { DEFAULT_SUPABASE_KEY, publishKeyProblem } from "../dist/supabase-rest.js";

const problem = publishKeyProblem(DEFAULT_SUPABASE_KEY);
if (problem) {
  console.error(`[chainhint-mcp] publish refused: ${problem} (src/supabase-rest.ts DEFAULT_SUPABASE_KEY)`);
  process.exit(1);
}
console.log("[chainhint-mcp] default Supabase key is a publishable key — ok to publish");
