/**
 * How a label may be PRINTED — a port of the smallest part of ChainHint's single print path.
 *
 * MIRROR of the main repo's backend/supabase/functions/_shared/label-trust.ts (`printedLabel`,
 * `graphItemTrust`, `heuristicDisplayName`, `sourceLabel`) and _shared/entity-display.ts
 * (`displayLabels`), as of 2026-11-15 (owner decision of that day: a name is always printed
 * together with how far it can be trusted). Change both or neither; test/label-print.test.mjs
 * pins the strings.
 *
 * The rule, in one line: a label that nothing verifies is a CLAIM, and it is printed with whose
 * claim it is — "Bybit Hack Exploiter — attributed by Bybit HackScan, unverified",
 * "Tornado Cash — mixer, unverified (ChainHint manual entry)" — never as "hacker" or "mixer"
 * on its own. A detector's flag is printed as the guess it is. A name read off the flow is
 * "inferred, not identified". Only verifying evidence on the address (a designation, a
 * law-enforcement attribution, a seizure order, an issuer freeze, an analyst verification)
 * lets the category stand without a marker — and an issuer freeze alone never verifies a
 * category.
 *
 * Deliberately NOT ported: the hover `note` texts, seizure / law-enforcement acting categories
 * (the MCP prints those from the API's `evidence` lines) and every scoring weight — the API
 * scores, this module only words.
 */

export type LabelTrust = "verified" | "attributed" | "unverified" | "heuristic";

// ── Evidence ────────────────────────────────────────────────────────────────

const VERIFYING_EVIDENCE_CLASSES: readonly string[] = [
  "sanctions_designation",
  "law_enforcement_attribution",
  "national_seizure_order",
  "issuer_freeze",
  "analyst_verified",
];

export function hasVerifyingEvidence(classes: ReadonlyArray<string> | null | undefined): boolean {
  return (classes ?? []).some((c) => VERIFYING_EVIDENCE_CLASSES.includes(c));
}

/** An issuer freeze verifies the freeze, never somebody's category (owner, 2026-11-15). */
export function hasCategoryVerifyingEvidence(classes: ReadonlyArray<string> | null | undefined): boolean {
  return (classes ?? []).some((c) => c !== "issuer_freeze" && VERIFYING_EVIDENCE_CLASSES.includes(c));
}

function hasSanctionsDesignation(classes: ReadonlyArray<string> | null | undefined): boolean {
  return (classes ?? []).includes("sanctions_designation");
}

// ── Categories ──────────────────────────────────────────────────────────────

/** Exact, reviewed list — never a substring match (owner rule R2). Same values as the backend's TAINT_CATEGORIES. */
const TAINT_CATEGORIES: ReadonlySet<string> = new Set([
  "sanctioned",
  "hacker", "hacker/exploit", "exploit",
  "scam", "drainer", "ponzi", "fraud", "phish", "phishing",
  "darknet",
  "mixer", "tumbler", "privacy",
  "gambling", "casino", "betting", "luck games",
  "high risk exchange",
  "restricted asset", "annex liii",
  "ransomware",
]);

export function isTaintCategory(category: string | null | undefined): boolean {
  const raw = (category ?? "").toLowerCase().replace(/_/g, " ").trim();
  return raw !== "" && TAINT_CATEGORIES.has(raw);
}

const isSanctionedCategory = (c: string | null | undefined) => /sanction/.test((c ?? "").toLowerCase());

// ── Heuristic detectors (Forta, ChainHint fan-in) ───────────────────────────

type HeuristicStatus = "unverified" | "pending_review";

const HEURISTIC_DETECTORS: Readonly<Record<string, { detector: string; status: HeuristicStatus }>> = {
  "forta":                { detector: "Forta", status: "unverified" },
  "forta:pending_review": { detector: "Forta", status: "pending_review" },
  "fanin_heuristic":      { detector: "ChainHint fan-in", status: "unverified" },
};

/** Stored traces carry the entity NAME, not its source: the names of the heuristic entities. */
const HEURISTIC_ENTITY_NAMES: Readonly<Record<string, string>> = {
  "forta: attacker": "forta",
  "forta: exploit address": "forta",
  "forta attacker labels": "forta",
  "forta: attacker (pending manual review)": "forta:pending_review",
  "forta attacker": "forta",
  "forta exploit": "forta",
  "forta detector: flagged as attacker (heuristic, unverified)": "forta",
  "forta detector: flagged as exploit address (heuristic, unverified)": "forta",
  "forta detector: flagged as attacker, pending manual review (heuristic, unverified)": "forta:pending_review",
  "forta detector alert (heuristic, unverified)": "forta",
  "forta detector alert, pending manual review (heuristic, unverified)": "forta:pending_review",
  "binance deposit": "fanin_heuristic",
  "bybit deposit": "fanin_heuristic",
  "exchange wallets kucoin deposit": "fanin_heuristic",
  "exchange wallets kucoin deposit deposit": "fanin_heuristic",
  "fixedfloat deposit": "fanin_heuristic",
  "htx deposit": "fanin_heuristic",
  "kucoin deposit": "fanin_heuristic",
  "mexc deposit": "fanin_heuristic",
  "okx deposit": "fanin_heuristic",
  "probable service deposit": "fanin_heuristic",
  "unverified deposit (fan-in)": "fanin_heuristic",
  "unidentified high fan-in wallet (service?)": "fanin_heuristic",
};

interface Subject { name?: string | null; source?: string | null }

function detectorKey(subject: Subject | null | undefined): string | null {
  if (!subject) return null;
  const s = (subject.source ?? "").trim();
  if (s && HEURISTIC_DETECTORS[s]) return s;
  if (s) return null; // a known non-detector source wins over the name
  const n = (subject.name ?? "").trim().toLowerCase();
  return HEURISTIC_ENTITY_NAMES[n] ?? null;
}

function heuristicFlagFor(subject: Subject | null | undefined): { detector: string; status: HeuristicStatus } | null {
  const key = detectorKey(subject);
  return key ? HEURISTIC_DETECTORS[key] : null;
}

/** "Detector alert (Forta), unverified" — never the stored "flagged as attacker". Null when the name is not a flag. */
function heuristicDisplayName(name: string | null | undefined, source?: string | null): string | null {
  const flag = heuristicFlagFor({ name: name?.trim() ?? null, source: source ?? null })
    ?? heuristicFlagFor({ name: name?.trim() ?? null });
  if (!flag) return null;
  if (flag.detector === "Forta") {
    return flag.status === "pending_review"
      ? "Detector alert (Forta), pending review"
      : "Detector alert (Forta), unverified";
  }
  const n = (name ?? "").trim();
  if (!n || /^(probable|likely|unverified|unidentified)\b/i.test(n)) return null;
  const subject = n.replace(/(\s+deposit)+$/i, "");
  return subject === n
    ? `Probable ${n} (heuristic, unverified)`
    : `Probable ${subject} deposit (heuristic, unverified)`;
}

// ── Attribution (a named source, no evidence) ───────────────────────────────

export const ATTRIBUTION_METHODS = ["clustering", "hackscan_trace", "victim_report", "public_label_registry"] as const;
export type AttributionMethod = typeof ATTRIBUTION_METHODS[number];

const METHOD_WORDS: Readonly<Record<AttributionMethod, string>> = {
  clustering: "clustering",
  hackscan_trace: "tracing from the theft",
  victim_report: "incident reports",
  public_label_registry: "a public label registry",
};

export function asAttributionMethod(value: unknown): AttributionMethod | null {
  return typeof value === "string" && (ATTRIBUTION_METHODS as readonly string[]).includes(value) ? value as AttributionMethod : null;
}

/**
 * entities.source → who published the attribution (the backend's ATTRIBUTION_SOURCES). Needed
 * because address-lookup returns the entity's `source` and `attribution_method` but not the
 * publisher; wallet-reputation returns `attribution.publisher` itself and does not need it.
 */
export const ATTRIBUTION_PUBLISHERS: Readonly<Record<string, { publisher: string; method: AttributionMethod }>> = {
  "walletexplorer":      { publisher: "WalletExplorer", method: "clustering" },
  "graphsense_tagpacks": { publisher: "GraphSense TagPacks", method: "clustering" },
  "arkham":              { publisher: "Arkham Intelligence", method: "clustering" },
  "bybit_hackscan":      { publisher: "Bybit HackScan", method: "hackscan_trace" },
  "ransomwhere":         { publisher: "Ransomwhere", method: "victim_report" },
  "manual-twitter-peckshield-certik": { publisher: "PeckShield / CertiK", method: "victim_report" },
  "defihacklabs":        { publisher: "DeFiHackLabs", method: "victim_report" },
  "etherscan-labels":    { publisher: "Etherscan", method: "public_label_registry" },
  "eth-labels":          { publisher: "Etherscan, eth-labels mirror", method: "public_label_registry" },
  "dawsbot":             { publisher: "Etherscan, eth-labels mirror", method: "public_label_registry" },
  "ton-labels":          { publisher: "ton-labels", method: "public_label_registry" },
  "tornado-cash-contracts": { publisher: "Tornado Cash's own contract list", method: "public_label_registry" },
};

/**
 * Publishers whose list is an official record of what the address IS (the backend's
 * `confirmed: true`): the marker names the list and does not say "unverified" —
 * "on Tornado Cash's own contract list". Nothing else changes: the label still acts on nobody.
 */
const CONFIRMED_PUBLISHERS: ReadonlySet<string> = new Set(["Tornado Cash's own contract list"]);

export const isConfirmedPublisher = (publisher: string | null | undefined): boolean => CONFIRMED_PUBLISHERS.has(publisher ?? "");

export interface StoredAttribution {
  method?: string | null;
  source?: string | null;
  publisher: string;
  note?: string | null;
}

/** The attribution an address-lookup entity row carries, in the shape a stored graph item has. Null when it is none. */
export function attributionOfEntityRow(row: {
  source?: string | null;
  category?: string | null;
  attribution_method?: string | null;
}): StoredAttribution | null {
  const method = asAttributionMethod(row.attribution_method);
  if (!method || !isTaintCategory(row.category) || isSanctionedCategory(row.category)) return null;
  const source = (row.source ?? "").trim();
  const known = ATTRIBUTION_PUBLISHERS[source];
  const publisher = known?.publisher ?? (source ? sourceLabel(source) : "an unnamed source");
  return { method, source: source || null, publisher, note: attributionNote(method, publisher) };
}

export function attributionNote(method: AttributionMethod, publisher: string): string {
  return `Attributed by ${METHOD_WORDS[method]} (${publisher}), unverified — not scored.`;
}

// ── Trust of a stored item ──────────────────────────────────────────────────

/** An entity row, a counterparty, a graph node or an endpoint — whatever carries a label. */
export interface PrintableLabel {
  entity_name?: string | null;
  entity?: string | null;
  /** addresses.label — printed only when no entity name is there. */
  label?: string | null;
  entity_category?: string | null;
  type?: string | null;
  entity_type?: string | null;
  entity_source?: string | null;
  evidence_classes?: ReadonlyArray<string> | null;
  attribution_unconfirmed?: boolean | null;
  /** Display stamp only — trust is recomputed from evidence_classes, the name and the attribution. */
  label_trust?: LabelTrust | null;
  attribution?: StoredAttribution | null;
  /** "goplus" for the live GoPlus flag fund-trace asks for a node no entity names. */
  category_source?: string | null;
  /** "outbound_flow" (a sweep) or "fan_in": how fund-trace reached the name when no entity gave it. */
  attributed_via?: string | null;
}

function attributableItem(item: PrintableLabel): boolean {
  const cat = item.entity_category ?? null;
  return isTaintCategory(cat) && !isSanctionedCategory(cat);
}

/**
 * Verified iff the stamped evidence classes verify (a freeze alone never verifies a taint
 * category); a Forta name or a "heuristic" stamp is heuristic; an "attributed" stamp with its
 * attribution on a taint category is attributed; everything else is unverified.
 */
export function graphItemTrust(item: PrintableLabel | null | undefined): LabelTrust {
  if (!item) return "unverified";
  if (hasVerifyingEvidence(item.evidence_classes) &&
    (!isTaintCategory(item.entity_category ?? null) || hasCategoryVerifyingEvidence(item.evidence_classes))) return "verified";
  if (item.attribution_unconfirmed === true) return "unverified";
  if (item.label_trust === "heuristic" || heuristicFlagFor({ name: item.entity_name ?? item.entity ?? null })) return "heuristic";
  if (item.label_trust === "attributed" && item.attribution?.publisher && attributableItem(item)) return "attributed";
  return "unverified";
}

/** A GoPlus category on a node no entity of ours names: the feed's word, never ours. */
function liveDetectorCategory(item: PrintableLabel): boolean {
  if (item.category_source === "goplus") return true;
  if (!isTaintCategory(item.entity_category ?? null) || (item.entity_name ?? item.entity)) return false;
  const verifying = (item.evidence_classes ?? []).filter((c) => VERIFYING_EVIDENCE_CLASSES.includes(c));
  return verifying.length > 0 && verifying.every((c) => c === "issuer_freeze");
}

/** The category a stored item ACTS with. (Seizure and law-enforcement classes are not ported — see the header.) */
function actingCategory(item: PrintableLabel): string | null {
  const cat = item.entity_category ?? null;
  if (!cat) return null;
  if (hasSanctionsDesignation(item.evidence_classes) && isTaintCategory(cat)) return "sanctioned";
  const trust = graphItemTrust(item);
  if (trust === "heuristic") return "unknown";
  if (isTaintCategory(cat) && liveDetectorCategory(item)) return "unknown";
  if (!isTaintCategory(cat)) return cat;
  if (isSanctionedCategory(cat)) return "unknown";
  return trust === "verified" ? cat : "unknown";
}

function actingType(item: PrintableLabel, field: "type" | "entity_type"): string | null {
  const t = item[field] ?? null;
  if (!t || !isTaintCategory(t)) return t;
  if (liveDetectorCategory(item)) return "unknown";
  return graphItemTrust(item) === "verified" && hasCategoryVerifyingEvidence(item.evidence_classes) ? t : "unknown";
}

/** The category a stored item is COUNTED with: the acting one — an attributed item keeps its taint category, printed with its marker. */
export function bucketCategory(item: PrintableLabel | null | undefined): string | null {
  if (!item) return null;
  return graphItemTrust(item) === "attributed" ? item.entity_category ?? null : actingCategory(item);
}

/** The display `type` an item is counted with (a taint type is a label too). */
export function bucketType(item: PrintableLabel | null | undefined, field: "type" | "entity_type" = "type"): string | null {
  if (!item) return null;
  return graphItemTrust(item) === "attributed" ? item[field] ?? null : actingType(item, field);
}

// ── One way to PRINT a label ────────────────────────────────────────────────

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  "chainhint:manual": "ChainHint manual entry",
  "chainhint_curated": "ChainHint manual entry",
  "manual": "ChainHint manual entry",
  "eth-labels": "eth-labels (Etherscan tags)",
  "etherscan-labels": "Etherscan tags",
  "dune-labels": "Dune labels",
  "flipside": "Flipside labels",
  "chain-read": "ChainHint chain read",
};

/** A label source as a reader should see it: "chainhint:manual" → "ChainHint manual entry". */
export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export interface PrintedLabel {
  /** The name as it may be printed; null when there is none. */
  name: string | null;
  /** The category it may be printed with — the one it is counted in; null when it acts as nothing. */
  category: string | null;
  /** A taint category the label CLAIMS and nothing verifies ("hacker"); printed only together with `marker`. */
  claimed: string | null;
  trust: LabelTrust;
  /** True for a name read off the flow (a sweep or fan-in guess): never an identification. */
  inferred: boolean;
  /** The words that must stand beside the name. Null when nothing needs saying. */
  marker: string | null;
  /** Name and marker in one line, for plain text. Null when there is nothing to print. */
  text: string | null;
}

const BARE_DEPOSIT = /^(.+?)(\s+deposit)+$/i;
const HEDGED = /^(probable|likely|unverified|unidentified|routed via)\b/i;

/** "Bybit deposit" read off a sweep → "Likely Bybit deposit (sweeps to a known Bybit wallet)". Wording only. */
function inferredName(name: string | null, via: string | null): string | null {
  if (!name || HEDGED.test(name)) return name;
  const m = BARE_DEPOSIT.exec(name);
  if (via === "fan_in") return m ? `Probable ${m[1]} deposit (heuristic, unverified)` : `Probable ${name} (heuristic, unverified)`;
  return m ? `Likely ${m[1]} deposit (sweeps to a known ${m[1]} wallet)` : name;
}

const shownCategory = (c: string | null | undefined): string | null => {
  const v = (c ?? "").trim();
  return v && v.toLowerCase() !== "unknown" ? v : null;
};

const categoryWords = (c: string) => c.toLowerCase().trim().replace(/[\s_-]+/g, " ");

export function printedLabel(item: PrintableLabel | null | undefined): PrintedLabel {
  if (!item) return { name: null, category: null, claimed: null, trust: "unverified", inferred: false, marker: null, text: null };
  const rawName = (item.entity_name ?? item.entity ?? item.label ?? "").trim() || null;
  const source = (item.entity_source ?? "").trim() || null;
  const rawCategory = (item.entity_category ?? "").trim() || null;
  const acting = shownCategory(bucketCategory(item)) ?? shownCategory(bucketType(item)) ?? shownCategory(bucketType(item, "entity_type"));
  const done = (p: Omit<PrintedLabel, "text">): PrintedLabel => {
    const beside = p.marker ? (p.claimed ? `${categoryWords(p.claimed)}, ${p.marker}` : p.marker) : null;
    const text = p.name ? (beside ? `${p.name} — ${beside}` : p.name) : beside;
    return { ...p, text };
  };

  // 1. A heuristic detector's flag (Forta, our fan-in): named as the guess it is, and it carries no category.
  const flag = heuristicFlagFor({ name: rawName, source }) ?? heuristicFlagFor({ name: rawName }) ??
    (item.label_trust === "heuristic" && !hasCategoryVerifyingEvidence(item.evidence_classes) ? { detector: "heuristic", status: "unverified" as const } : null);
  // 2. A name read off the flow: where the money went next, never who owns the address.
  const via = item.attributed_via === "fan_in" ? "fan_in"
    : item.attributed_via === "outbound_flow" ? "outbound_flow" : null;
  if (via && rawName && flag?.detector !== "Forta" && !hasCategoryVerifyingEvidence(item.evidence_classes)) {
    return done({ name: inferredName(rawName, via), category: acting, claimed: null, trust: "heuristic", inferred: true, marker: "inferred, not identified" });
  }
  if (flag && graphItemTrust(item) !== "verified") {
    const name = heuristicDisplayName(rawName, source) ?? rawName;
    return done({ name, category: null, claimed: null, trust: "heuristic", inferred: flag.detector !== "Forta", marker: null });
  }

  // 3. A live GoPlus category: the feed's word, never ours — whatever else is on the address.
  if (rawCategory && isTaintCategory(rawCategory) && liveDetectorCategory(item)) {
    if ((item.evidence_classes ?? []).includes("issuer_freeze")) {
      return done({ name: rawName, category: acting, claimed: null, trust: "unverified", inferred: false, marker: null });
    }
    return done({ name: rawName, category: acting, claimed: rawCategory, trust: "unverified", inferred: false, marker: "third-party security flag (GoPlus), unverified" });
  }

  const trust = graphItemTrust(item);
  const attribution = trust === "attributed" ? item.attribution ?? null : null;
  if (attribution) {
    // A confirmed source (the protocol's own list) is named, not hedged.
    const marker = CONFIRMED_PUBLISHERS.has(attribution.publisher) ? `on ${attribution.publisher}` : `attributed by ${attribution.publisher}, unverified`;
    return done({ name: rawName, category: acting, claimed: null, trust, inferred: false, marker });
  }
  // 4. A taint label nothing verifies: printed as a claim, with whose it is.
  if (rawCategory && isTaintCategory(rawCategory) && trust !== "verified") {
    if (isSanctionedCategory(rawCategory)) {
      return done({ name: rawName, category: acting, claimed: null, trust, inferred: false, marker: "unverified label — no sanctions designation on file" });
    }
    const from = source ? ` (${sourceLabel(source)})` : "";
    return done({ name: rawName, category: acting, claimed: rawCategory, trust, inferred: false, marker: `unverified${from}` });
  }
  // 5. Verified, or a service / plain name: nothing needs saying beside it.
  return done({ name: rawName, category: acting, claimed: null, trust, inferred: false, marker: null });
}
