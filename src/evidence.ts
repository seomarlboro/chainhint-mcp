/**
 * Address evidence wording — MIRROR of the main repo's
 * backend/supabase/functions/_shared/evidence-labels.ts (migration 129).
 * Change both or neither; test/evidence.test.mjs pins the strings.
 *
 * Rule (owner decision 2026-09-14): "Sanctioned" is printed only for a
 * sanctions designation. A law-enforcement attribution, an issuer freeze, a
 * national seizure order and an industry blocklist each say what they are and
 * that they are not a sanctions designation.
 */

export const EVIDENCE_CLASSES = [
  "sanctions_designation",
  "law_enforcement_attribution",
  "issuer_freeze",
  "national_seizure_order",
  "industry_blocklist",
  "analyst_verified",
] as const;

export type EvidenceClass = typeof EVIDENCE_CLASSES[number];

export interface EvidenceItem {
  class: EvidenceClass | string;
  authority: string;
  subject?: string | null;
  document_ref?: string | null;
  document_url?: string | null;
  document_date?: string | null;
  legal_basis?: string | null;
  token?: string | null;
  chain?: string | null;
  first_seen_at?: string | null;
}

export const NOT_A_SANCTIONS_DESIGNATION = "Not a sanctions designation.";

const TITLES: Record<EvidenceClass, { icon: string; title: string }> = {
  sanctions_designation:       { icon: "⛔", title: "Sanctioned" },
  law_enforcement_attribution: { icon: "🚩", title: "Law-enforcement attribution" },
  issuer_freeze:               { icon: "🧊", title: "Frozen by issuer" },
  national_seizure_order:      { icon: "🏛️", title: "National seizure order" },
  industry_blocklist:          { icon: "⚠️", title: "Industry blocklist" },
  analyst_verified:            { icon: "🔎", title: "Analyst-verified" },
};

const CHAIN_NAMES: Record<string, string> = { bsc: "BSC", tron: "TRON", ton: "TON" };

function isEvidenceClass(v: unknown): v is EvidenceClass {
  return typeof v === "string" && (EVIDENCE_CLASSES as readonly string[]).includes(v);
}

function chainName(chain: string | null | undefined): string {
  const c = (chain ?? "").trim().toLowerCase();
  if (!c) return "";
  return CHAIN_NAMES[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

function day(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : null;
}

const join = (parts: Array<string | null | undefined>, sep: string) =>
  parts.filter((p): p is string => !!p && p.trim() !== "").join(sep);

function attributionLine(e: EvidenceItem): string {
  const date = day(e.document_date);
  let head = join([e.authority, e.document_ref], ", ");
  if (date) head = `${head} (${date})`;
  return e.subject ? `${head}: ${e.subject}` : head;
}

/** "⛔ Sanctioned — US OFAC · … " / "🧊 Frozen by issuer — Tether (USDT, TRON) · … Not a sanctions designation." */
export function evidenceText(e: EvidenceItem): string | null {
  if (!isEvidenceClass(e.class)) return null;
  const { icon, title } = TITLES[e.class];
  const date = day(e.document_date);
  let line: string;
  switch (e.class) {
    case "sanctions_designation":
      line = join([e.authority, e.document_ref ?? e.legal_basis, date, e.subject], " · ");
      break;
    case "issuer_freeze": {
      const what = join([e.token, chainName(e.chain)], ", ");
      const when = date ?? join(["first seen by ChainHint", day(e.first_seen_at)], " ");
      line = join([what ? `${e.authority} (${what})` : e.authority, when], " · ");
      break;
    }
    case "law_enforcement_attribution":
    case "national_seizure_order":
      line = attributionLine(e);
      break;
    default:
      line = join([e.authority, e.subject, date ?? (e.first_seen_at ? `first seen by ChainHint ${day(e.first_seen_at)}` : null)], " · ");
  }
  const caveat = e.class === "sanctions_designation" ? null : NOT_A_SANCTIONS_DESIGNATION;
  return `${icon} ${caveat ? `${title} — ${line}. ${caveat}` : `${title} — ${line}`}`;
}

/** Designations first, then by strength of proof; unknown classes dropped. */
export function evidenceLines(items: ReadonlyArray<EvidenceItem> | null | undefined): string[] {
  if (!items?.length) return [];
  const rank = (c: string) => (EVIDENCE_CLASSES as readonly string[]).indexOf(c);
  return [...items]
    .filter((e) => isEvidenceClass(e.class))
    .sort((a, b) => rank(a.class) - rank(b.class))
    .map((e) => `- ${evidenceText(e)}`);
}
