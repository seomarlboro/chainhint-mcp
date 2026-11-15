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
 *
 * Since 1.4.5 a name is also printed with how far it can be trusted — see label-print.ts
 * (a port of the main product's printedLabel, 2026-11-15). `entityLine` no longer prints a
 * stored taint category ("hacker", "mixer", "scam") as a bare fact.
 */

import {
  asAttributionMethod, attributionOfEntityRow, isConfirmedPublisher, printedLabel, sourceLabel,
  type LabelTrust, type PrintableLabel, type StoredAttribution,
} from "./label-print.js";

export interface EntityBlock {
  name: string;
  category?: string | null;
  subcategory?: string | null;
  verified?: boolean | null;
  /** 0..1 (address-lookup). */
  confidence?: number | null;
  attribution_unconfirmed?: boolean | null;
  operating_status?: string | null;
  /** address-lookup: the entity row's source ("bybit_hackscan", "chainhint:manual"). wallet-reputation does not send it. */
  source?: string | null;
  /** address-lookup: the method when the source attributes (null for a manual entry). */
  attribution_method?: string | null;
  /** wallet-reputation (migration 148): what the label is worth. address-lookup does not send it. */
  label_trust?: LabelTrust | string | null;
  /** wallet-reputation: a detector's flag (Forta, fan-in). */
  heuristic_flag?: { detector?: string; status?: string; note?: string } | null;
  /** wallet-reputation: who attributed the label and how. */
  attribution?: { method?: string | null; publisher?: string | null; note?: string | null } | null;
  /** "attributed on Arbitrum" — the name comes from the same address on another chain. */
  attributed_on_note?: string | null;
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

export interface EntityPrintOptions {
  showVerified?: boolean;
  /** `evidence[].class` of the same response — the only thing that lets a taint category stand without a marker. */
  evidenceClasses?: ReadonlyArray<string> | null;
  /** "attributed on Arbitrum" (the response's, when the entity block does not carry it). */
  attributedOnNote?: string | null;
}

/** An API entity block as the one print path reads it. Exported for the tests. */
export function entityPrintable(e: EntityBlock, evidenceClasses?: ReadonlyArray<string> | null): PrintableLabel {
  const given = e.attribution?.publisher
    ? { method: e.attribution.method ?? null, source: e.source ?? null, publisher: e.attribution.publisher, note: e.attribution.note ?? null }
    : null;
  const attribution: StoredAttribution | null = given
    ?? attributionOfEntityRow({ source: e.source, category: e.category, attribution_method: e.attribution_method });
  const stamp = e.heuristic_flag ? "heuristic"
    : e.label_trust === "attributed" || e.label_trust === "heuristic" || e.label_trust === "verified" || e.label_trust === "unverified" ? e.label_trust
    : attribution ? "attributed" : null;
  return {
    entity_name: e.name,
    entity_category: e.category ?? null,
    entity_source: e.source ?? null,
    evidence_classes: evidenceClasses ?? null,
    attribution_unconfirmed: e.attribution_unconfirmed ?? null,
    label_trust: stamp,
    // An "attributed" stamp from a response that names no attribution cannot be printed as one.
    attribution: stamp === "attributed" ? attribution : null,
  };
}

/**
 * "**Entity:** Binance (exchange / hot_wallet, verified)" for a plain or verified entity;
 * a taint label nothing verifies is printed as a claim with whose it is:
 *   "**Entity:** Bybit Hack Exploiter — attributed by Bybit HackScan, unverified"
 *   "**Entity:** Tornado Cash — mixer, unverified (ChainHint manual entry)"
 *   "**Entity:** Detector alert (Forta), unverified"
 * An unconfirmed attribution prints its stored category as a candidate and never as verified.
 */
export function entityLine(e: EntityBlock, opts: EntityPrintOptions = {}): string {
  const unconfirmed = isUnconfirmedAttribution(e);
  const shown = printedLabel(entityPrintable(e, opts.evidenceClasses));
  const onNote = opts.attributedOnNote ?? e.attributed_on_note ?? null;
  const markers = [...(onNote ? [onNote] : []), ...entityMarkers(e)];
  let head: string;
  if (!unconfirmed && (shown.marker || shown.trust === "heuristic") && shown.text) {
    head = `**Entity:** ${shown.text}`;
  } else {
    const cat = [e.category, e.subcategory].filter((p): p is string => !!p && p.trim() !== "").join(" / ");
    const parts: string[] = [];
    if (cat) parts.push(unconfirmed ? `candidate: ${cat}` : cat);
    if (!unconfirmed && opts.showVerified && e.verified) parts.push("verified");
    if (!unconfirmed && e.confidence != null && Number.isFinite(e.confidence)) {
      parts.push(`confidence ${Math.round(e.confidence * 100)}%`);
    }
    head = `**Entity:** ${e.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
  }
  return markers.length ? `${head} — ${markers.join(" ")}` : head;
}

/** The API's own note about an attribution ("… sets a minimum of 70 on this address."), when it sent one. */
export function attributionNoteLine(e: EntityBlock | null | undefined): string | null {
  // The API's note for a confirmed list still says "unverified"; the Entity line says "on <list>", so it is not repeated.
  if (isConfirmedPublisher(e?.attribution?.publisher)) return null;
  const note = e?.attribution?.note;
  return typeof note === "string" && note.trim() && asAttributionMethod(e?.attribution?.method ?? null) ? `**Attribution:** ${note.trim()}` : null;
}

/** The neutral label an address named only in a court filing carries (import-court-filings.py NEUTRAL_LABEL). */
export const COURT_FILING_LABEL = "Named in US court filing";

export interface PublicRecordItem {
  authority?: string | null;
  document_ref?: string | null;
  document_date?: string | null;
  document_label?: string | null;
  caveat?: string | null;
}

/**
 * A court-filing citation, never a badge and never a score — the address is named in a public
 * document the reader can open (the site's "Public record" card). The API's own caveat first.
 */
export function publicRecordLines(items: ReadonlyArray<PublicRecordItem> | null | undefined): string[] {
  const list = (items ?? []).filter((m) => m && (m.authority || m.document_label || m.document_ref));
  if (!list.length) return [];
  const caveat = list.find((m) => m.caveat)?.caveat
    ?? "Named in a public court filing. No role is asserted — filings name victims, exchanges and unrelated third parties alongside defendants.";
  const lines = [`**Public record:** ${caveat} It is a citation, not a risk finding.`];
  for (const m of list) {
    const ref = m.document_ref ?? m.document_label;
    const date = m.document_date && !(ref ?? "").includes(m.document_date) ? m.document_date : null;
    const what = [m.authority, ref, date].filter((p): p is string => !!p && p.trim() !== "");
    lines.push(`- ${what.join(" · ")}`);
  }
  return lines;
}

/**
 * The `Labels:` line (+ the public-record line). `labels` is the API's flat string list: no
 * trust travels with a string, so (1) the entity's own name is left out — it is printed on the
 * Entity line with its marker — (2) the court-filing label becomes a citation, and (3) what is
 * left is said to carry no verification of its own.
 */
export function labelLines(input: {
  labels?: ReadonlyArray<string> | null;
  entityName?: string | null;
  /** True when verifying evidence is on the address: its labels are then backed by the Evidence lines. */
  hasEvidence?: boolean;
  publicRecord?: ReadonlyArray<PublicRecordItem> | null;
}): string[] {
  const out: string[] = [];
  const entityName = (input.entityName ?? "").trim().toLowerCase();
  const all = [...new Set(input.labels ?? [])];
  const court = all.some((l) => l === COURT_FILING_LABEL);
  const rest = all.filter((l) => l !== COURT_FILING_LABEL && l.trim().toLowerCase() !== entityName);
  if (rest.length) {
    out.push(`**Labels:** ${rest.join(", ")}${input.hasEvidence ? "" : " — as stored by their sources; none is verified unless an Evidence line says so"}`);
  }
  const record = publicRecordLines(input.publicRecord);
  if (record.length) out.push(...record);
  else if (court) out.push(`**Public record:** Named in a US court filing — a citation, not a risk finding; no role is asserted. lookup_address lists the documents.`);
  return out;
}

/** What both tools read from a response to print the entity and its labels. */
export interface LabelledResponse {
  entity?: EntityBlock | null;
  /** wallet-reputation's top-level acting category — printed only when there is no entity name. */
  category?: string | null;
  labels?: ReadonlyArray<string> | null;
  evidence?: ReadonlyArray<{ class: string }> | null;
  attributed_on_note?: string | null;
  public_record?: ReadonlyArray<PublicRecordItem> | null;
  attribution_basis?: { note?: string | null } | null;
}

/** The Entity line and the lines that explain it. `wallet` = check_wallet_risk (falls back to the top-level category). */
export function entitySection(d: LabelledResponse, opts: { wallet?: boolean } = {}): string[] {
  const classes = (d.evidence ?? []).map((e) => e.class);
  if (d.entity?.name) {
    const lines = [entityLine(d.entity, { showVerified: opts.wallet === true, evidenceClasses: classes, attributedOnNote: d.attributed_on_note })];
    const note = attributionNoteLine(d.entity);
    if (note) lines.push(note);
    if (d.attribution_basis?.note) lines.push(`**Why this name:** ${d.attribution_basis.note}`);
    return lines;
  }
  if (opts.wallet && d.category && d.category.toLowerCase() !== "unknown") return [`**Category:** ${d.category}`];
  return [`**Entity:** Unknown / unlabeled`];
}

/** The Labels line and the public-record citation. */
export function labelsSection(d: LabelledResponse): string[] {
  return labelLines({ labels: d.labels, entityName: d.entity?.name, hasEvidence: (d.evidence ?? []).length > 0, publicRecord: d.public_record });
}

export { sourceLabel };
