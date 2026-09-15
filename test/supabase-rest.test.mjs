// Run: npm test (builds, then node --test). Imports the compiled module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SUPABASE_KEY, isSupabaseKeyConfigured, LEGACY_ANON_KEY_ENV, PUBLISHABLE_KEY_ENV, PUBLISHABLE_KEY_PLACEHOLDER,
  publishKeyProblem, resolveSupabaseKey, supabaseRestHeaders,
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

test("compiled server never builds `Bearer ${<supabase key>}` and ships no JWT", () => {
  const js = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /Bearer \$\{SUPABASE_(ANON_)?KEY\}/);
  assert.match(js, /supabaseRestHeaders\(SUPABASE_KEY\)/);
  for (const f of ["../dist/index.js", "../dist/supabase-rest.js"]) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /eyJhbGciOi/, f);
  }
});

test("publish guard: only a real sb_publishable_ key may ship as the default", () => {
  assert.equal(publishKeyProblem(PUBLISHABLE_KEY_PLACEHOLDER), "the default key is still the placeholder");
  assert.match(publishKeyProblem("eyJhbGciOiJIUzI1NiJ9.e30.x"), /JWT/);
  assert.match(publishKeyProblem("sb_secret_abcdefghijklmnopqrstuvwx"), /SECRET/);
  assert.match(publishKeyProblem("pk_live_whatever"), /does not look like/);
  assert.equal(publishKeyProblem("sb_publishable_abcdefghijklmnopqrstuvwx"), null);
  // Green before the owner pastes the key (placeholder) and after (a real key) — never a JWT.
  assert.ok(DEFAULT_SUPABASE_KEY === PUBLISHABLE_KEY_PLACEHOLDER || publishKeyProblem(DEFAULT_SUPABASE_KEY) === null);
});

test("runtime: the placeholder or a JWT never reaches PostgREST; an override does", () => {
  assert.equal(isSupabaseKeyConfigured(PUBLISHABLE_KEY_PLACEHOLDER), false);
  assert.equal(isSupabaseKeyConfigured("eyJhbGciOiJIUzI1NiJ9.e30.x"), false);
  assert.equal(isSupabaseKeyConfigured(""), false);
  assert.equal(isSupabaseKeyConfigured("sb_publishable_abcdefghijklmnopqrstuvwx"), true);
  assert.equal(isSupabaseKeyConfigured(resolveSupabaseKey({ [PUBLISHABLE_KEY_ENV]: "sb_publishable_fromenv_0123456789" }, PUBLISHABLE_KEY_PLACEHOLDER)), true);
});
