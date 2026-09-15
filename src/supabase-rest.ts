// KIR-81 (1.4.0): the Supabase project key is a publishable key
// (`sb_publishable_…`), not a JWT. It is sent ONLY in the `apikey` header —
// never as `Authorization: Bearer`, which PostgREST would try to verify as a
// JWT. Versions < 1.4.0 sent the legacy anon JWT in both headers and stop
// working when the project disables its legacy API keys.

/** Env var for the project key (1.4.0+). */
export const PUBLISHABLE_KEY_ENV = "CHAINHINT_SUPABASE_PUBLISHABLE_KEY";
/** Pre-1.4.0 name, still honoured so existing configs keep their override. */
export const LEGACY_ANON_KEY_ENV = "CHAINHINT_SUPABASE_ANON_KEY";

/** Env override first (new name, then the legacy name), else the built-in default. */
export function resolveSupabaseKey(
  env: Record<string, string | undefined>,
  fallback: string,
): string {
  const fromEnv = env[PUBLISHABLE_KEY_ENV] || env[LEGACY_ANON_KEY_ENV];
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : fallback;
}

/** Headers for an anonymous REST read of a public view: key in apikey only. */
export function supabaseRestHeaders(key: string): Record<string, string> {
  return { apikey: key, Accept: "application/json" };
}
