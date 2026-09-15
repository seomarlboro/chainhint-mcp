// Run: npm test (builds, then node --test). Imports the compiled module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEGACY_ANON_KEY_ENV, PUBLISHABLE_KEY_ENV, resolveSupabaseKey, supabaseRestHeaders,
} from "../dist/supabase-rest.js";

test("REST headers: project key only in apikey, never as a Bearer token (KIR-81)", () => {
  const h = supabaseRestHeaders("sb_publishable_example");
  assert.equal(h.apikey, "sb_publishable_example");
  assert.equal(h.Authorization, undefined);
  assert.equal(h.authorization, undefined);
});

test("key resolution: new env name wins, legacy name still honoured, else default", () => {
  assert.equal(resolveSupabaseKey({ [PUBLISHABLE_KEY_ENV]: "new", [LEGACY_ANON_KEY_ENV]: "old" }, "dflt"), "new");
  assert.equal(resolveSupabaseKey({ [LEGACY_ANON_KEY_ENV]: "old" }, "dflt"), "old");
  assert.equal(resolveSupabaseKey({ [PUBLISHABLE_KEY_ENV]: "  " }, "dflt"), "dflt");
  assert.equal(resolveSupabaseKey({}, "dflt"), "dflt");
});

test("compiled server never builds `Bearer ${<supabase key>}`", () => {
  const js = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /Bearer \$\{SUPABASE_(ANON_)?KEY\}/);
  assert.match(js, /supabaseRestHeaders\(SUPABASE_KEY\)/);
});
