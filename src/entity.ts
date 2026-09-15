/**
 * Entity wording — pure functions, tested in test/entity.test.mjs.
 *
 * Mirrors two optional entity fields the ChainHint API adds with migration 144
 * (main repo: backend/supabase/functions/_shared/entity-attribution.ts,
 * src/lib/entityCategory.ts):
 *
 *   attribution_unconfirmed: true — the named actor is a CANDIDATE, not a
 *     finding (e.g. Flipside-sourced Coinbase forwarders). wallet-reputation
 *     then answers top-level `category: "unknown"`. Shown, marked, never acted
 *     on: not a known entity, not a freeze target, not a reason to lower risk.
 *   operating_status: "closed" | "bankrupt" — the venue no longer operates.
 *
 * Both are optional: an API response without them prints exactly what 1.3.3
 * printed.
 */

export interface EntityBlock {
  name: string;
  category?: string | null;
  subcategory?: string | null;
  verified?: boolean | null;
  /** 0..1 (address-lookup). */
  confidence?: number | null;
  attribution_unconfirmed?: boolean | null;
  operating_status?: string | null;
}

export type OperatingStatus = "closed" | "bankrupt";

export function isUnconfirmedAttribution(e: EntityBlock | null | undefined): boolean {
  return e?.attribution_unconfirmed === true;
}

/** "closed" | "bankrupt" when set; unknown values are ignored (same as the backend). */
export function entityOperatingStatus(e: EntityBlock | null | undefined): OperatingStatus | null {
  const s = (e?.operating_status ?? "").toLowerCase();
  return s === "closed" || s === "bankrupt" ? s : null;
}

/** The sentences printed after the entity, in order. Empty when there is nothing to say. */
export function entityMarkers(e: EntityBlock | null | undefined): string[] {
  const out: string[] = [];
  if (isUnconfirmedAttribution(e)) {
    out.push("⚠️ Attribution unconfirmed — the named actor is a candidate, not a finding. Do not treat it as a known entity, a freeze target or a reason to lower risk.");
  }
  const status = entityOperatingStatus(e);
  if (status === "closed") out.push("Venue closed — a freeze request may not reach a compliance desk.");
  if (status === "bankrupt") out.push("Bankrupt — address the estate / trustee.");
  return out;
}

/**
 * "**Entity:** Binance (exchange / hot_wallet, verified)" — plus the markers.
 * An unconfirmed attribution prints its stored category as a candidate and
 * never as verified.
 */
export function entityLine(e: EntityBlock, opts: { showVerified?: boolean } = {}): string {
  const unconfirmed = isUnconfirmedAttribution(e);
  const cat = [e.category, e.subcategory].filter((p): p is string => !!p && p.trim() !== "").join(" / ");
  const parts: string[] = [];
  if (cat) parts.push(unconfirmed ? `candidate: ${cat}` : cat);
  if (!unconfirmed && opts.showVerified && e.verified) parts.push("verified");
  if (!unconfirmed && e.confidence != null && Number.isFinite(e.confidence)) {
    parts.push(`confidence ${Math.round(e.confidence * 100)}%`);
  }
  const head = `**Entity:** ${e.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  const markers = entityMarkers(e);
  return markers.length ? `${head} — ${markers.join(" ")}` : head;
}
