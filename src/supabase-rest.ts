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

/** Marker the default carries until the owner pastes the real publishable key. */
export const PUBLISHABLE_KEY_PLACEHOLDER = "sb_publishable_PASTE_BEFORE_PUBLISH";

/**
 * ChainHint's Supabase publishable key (sb_publishable_…) — public by design, the
 * same value the chainhint.com bundle ships. Paste it here before `npm publish`;
 * `prepublishOnly` (scripts/check-publish.mjs) refuses to publish while this is the
 * placeholder, a JWT or anything that is not a publishable key.
 */
export const DEFAULT_SUPABASE_KEY: string = PUBLISHABLE_KEY_PLACEHOLDER;

/** Why `key` must not be the published default, or null when it is a real publishable key. */
export function publishKeyProblem(key: string): string | null {
  const k = (key ?? "").trim();
  if (k === PUBLISHABLE_KEY_PLACEHOLDER) return "the default key is still the placeholder";
  if (k.startsWith("eyJ")) return "the default key is a JWT (legacy anon key) — use the sb_publishable_ key";
  if (k.startsWith("sb_secret_")) return "the default key is a SECRET key — never ship it";
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(k)) return "the default key does not look like an sb_publishable_ key";
  return null;
}

/** true when REST reads can run: an override or a real default. */
export function isSupabaseKeyConfigured(key: string): boolean {
  return publishKeyProblem(key) === null || ((key ?? "").trim() !== "" && (key ?? "").trim() !== PUBLISHABLE_KEY_PLACEHOLDER && !(key ?? "").trim().startsWith("eyJ"));
}
