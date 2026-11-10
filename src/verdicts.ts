/**
 * Verdict wording — pure functions, tested in test/verdicts.test.mjs.
 *
 * One rule, the same as chainhint.com (KIR-83): when ChainHint could not read
 * the data, the tool says so. A missing input is never printed as "CLEAN",
 * "0/100" or "Trace complete".
 *
 * 1.3.1 and earlier printed "Risk Score: 0/100 — CLEAN" for a Solana address
 * whose transfer history could not be read (the API already returned
 * risk_status "unavailable") and "✅ Trace complete" for an incident whose
 * stored trace had no transfers.
 */

/**
 * The 12 chains ChainHint traces. Mirror of CHAINS in the backend
 * (backend/supabase/functions/_shared/address-validation.ts in the main repo).
 */
export const TRACEABLE_CHAINS = [
  "ethereum", "bsc", "polygon", "arbitrum", "optimism", "base",
  "avalanche", "gnosis", "bitcoin", "solana", "tron", "ton",
] as const;

export function isTraceableChain(chain: string | null | undefined): boolean {
  return typeof chain === "string" && (TRACEABLE_CHAINS as readonly string[]).includes(chain.trim().toLowerCase());
}

/** Same sentence as the backend's tracingUnavailableMessage. */
export function tracingUnavailableMessage(chain: string | null | undefined): string {
  const c = (chain ?? "").trim();
  if (!c || c.toLowerCase() === "unknown") return "Tracing not available — the chain is unknown";
  return `Tracing not available for ${c.charAt(0).toUpperCase()}${c.slice(1)}`;
}

/**
 * The words ChainHint prints for a score — the address page, the Telegram bot, the PDF and the
 * API's `risk_label`: one ladder, 81 / 61 / 41 / 21. Until 1.4.4 this file printed the API's
 * level TOKEN in capitals, and the tokens cross the words: `low` is the band every other
 * surface calls "Moderate", while "Low Risk" is the token `clean`. So one address read
 * "30/100 · Moderate" in the bot and "30/100 — LOW" here. The fallback also still cut at
 * 90 / 70 / 40 / 10, the ladder the API left on 2026-11-01.
 */
export function riskLabel(score: number): string {
  if (score >= 81) return "Critical";
  if (score >= 61) return "High Risk";
  if (score >= 41) return "Elevated";
  if (score >= 21) return "Moderate";
  return "Low Risk";
}

/** The API's own label when it sent one, else the same ladder computed here. */
function labelFor(score: number, apiLabel: string | null | undefined): string {
  return typeof apiLabel === "string" && apiLabel.trim() ? apiLabel.trim() : riskLabel(score);
}

/**
 * Risk factors the API still returns in the response shape but no longer
 * scores (always false). Never printed, whatever an old or cached response says.
 * contract_not_verified: retired 2026-09-15 (risk-engine.ts) — the contract
 * flag it read was wrong on every audited row.
 */
export const RETIRED_RISK_FACTORS: readonly string[] = ["contract_not_verified"];

export type DataUnavailable = { provider?: string; reason?: string };

/** `screen_status` of both endpoints: which screens answered, and one sentence naming those that did not. */
export interface ScreenStatusLike { complete?: boolean; incomplete?: string[]; note?: string | null }

export interface LookupRiskInput {
  /** `null` since 2026-10: the API withholds the legacy block exactly when it refuses the score. */
  risk?: { score: number; level?: string; factors?: Record<string, boolean>; details?: string[] } | null;
  /** The verdict beside it — `score: null`, `level: "unknown"` when a screen did not answer. */
  risk_verdict?: { score?: number | null; level?: string; label?: string | null; screen_status?: ScreenStatusLike | null } | null;
  /** "Checked N counterparties in recent transfers, none flagged. Older activity was not read." */
  score_basis?: string | null;
  /** address-lookup: "scored" | "insufficient_data" | "unavailable". Absent on old API versions. */
  risk_status?: string;
  data_availability?: { transfers?: string; provider?: string; reason?: string; detail?: string };
  exposure?: { data_unavailable?: DataUnavailable | null } | null;
}

function unavailableDetail(d: LookupRiskInput): string {
  const provider = d.data_availability?.provider ?? d.exposure?.data_unavailable?.provider;
  return d.data_availability?.detail
    ?? `transfer data${provider ? ` (${provider})` : ""} could not be read`;
}

/** The API's detail may already say "not a clean result" — don't say it twice. */
function notClean(detail: string): string {
  return /not a clean result/i.test(detail) ? "" : " This is not a clean result.";
}

/** "Absence of data is not a clean verdict." is the API's own closing sentence — say it once. */
function notScoredLine(why: string): string {
  const said = /not a clean (result|verdict)/i.test(why);
  const body = why.replace(/\.\s*$/, "");
  return `**Risk:** ⚪ NOT SCORED — ${body}.${said ? "" : " This is not a clean result."} No risk score is printed.`;
}

/** `is_contract` is `null` when the contract read did not answer — never "EOA". */
export function addressTypeLine(isContract: boolean | null | undefined): string {
  if (isContract === true) return "**Type:** Smart Contract";
  if (isContract === false) return "**Type:** EOA (wallet)";
  return "**Type:** not determined — the contract check did not answer";
}

export interface ReputationRiskInput {
  risk_score?: number | null;
  risk_level?: string | null;
  /** The words for the score (API, since 2026-11-01). */
  risk_label?: string | null;
  /** Why an outbound floor set the score — "39% of outflow went to mixer users (Tornado Cash)" (API, since 2026-11-10). */
  score_reasons?: string[] | null;
  risk_status?: string | null;
  risk_score_note?: string | null;
  score_basis?: string | null;
  exposure_checked?: boolean | null;
  screen_status?: ScreenStatusLike | null;
  sanctions?: { hit?: boolean | null; complete?: boolean | null } | null;
}

/**
 * The risk lines of check_wallet_risk for an address the database holds. Until 1.4.3 this
 * was one template — `${risk_score}/100 — ${risk_level}` — which printed "null/100 — UNKNOWN"
 * for a withheld score and never mentioned an incomplete screen or an unread exposure.
 */
export function reputationRiskLines(d: ReputationRiskInput): string[] {
  const note = d.screen_status?.note ?? null;
  if (typeof d.risk_score !== "number") {
    return [notScoredLine(note ?? d.risk_score_note ?? "no score is available for this address")];
  }
  const lines = [`**Risk Score:** ${d.risk_score}/100 — **${labelFor(d.risk_score, d.risk_label)}**`];
  const reasons = (d.score_reasons ?? []).filter((r) => typeof r === "string" && r.trim());
  if (reasons.length) lines.push(`**Why:** ${reasons.join("; ")}`);
  if (d.score_basis) lines.push(`**Basis:** ${d.score_basis}`);
  if (d.exposure_checked === false) {
    lines.push("**Counterparty Exposure:** not checked — outbound counterparties were not read, so the score above is a floor, not a full assessment.");
  }
  // A score above the clean band is still printed over an incomplete screen; say what is missing.
  if (note) lines.push(`⚠️ ${note}`);
  else if (d.sanctions?.complete === false) lines.push("⚠️ Sanctions screen incomplete — it could not be read. This is not a clean result.");
  return lines;
}

/** The risk lines of lookup_address. Never a score when there was nothing to score. */
export function lookupRiskLines(d: LookupRiskInput): string[] {
  // A screen that did not answer says which one and why (the API's own sentence). It comes
  // first: "transfer data could not be read" was printed for ANY `unavailable`, including a
  // sanctions screen or a GoPlus refusal that had nothing to do with transfers.
  const screenNote = d.risk_verdict?.screen_status?.note ?? null;
  if (d.risk_status === "unavailable") {
    if (screenNote) return [notScoredLine(screenNote)];
    const why = unavailableDetail(d);
    return [`**Risk:** ⚪ DATA UNAVAILABLE — ${why}.${notClean(why)} No risk score was computed.`];
  }
  if (d.risk_status === "insufficient_data") {
    return [
      `**Risk:** ⚪ NOT SCORED — insufficient data. This is not evidence the address is clean.`,
    ];
  }
  // The score was withheld (`risk: null`) while `risk_status` still read "scored" — an
  // address that carries a label and a screen that did not answer. This returned NO line at
  // all until 1.4.3, so the report named the entity and said nothing about risk: an agent
  // reads that silence as "nothing wrong".
  if (!d.risk) {
    return [notScoredLine(screenNote ?? "the score was withheld because a screen that could have raised it did not answer")];
  }

  const lines = [`**Risk Score:** ${d.risk.score}/100 — **${labelFor(d.risk.score, d.risk_verdict?.label)}**`];
  const factors = Object.entries(d.risk.factors ?? {})
    .filter(([k, v]) => v === true && !RETIRED_RISK_FACTORS.includes(k))
    .map(([k]) => k);
  if (factors.length) lines.push(`**Risk Factors:** ${factors.join(", ")}`);
  if (d.risk.details?.length) lines.push(`**Risk Details:** ${d.risk.details.join("; ")}`);
  if (d.score_basis) lines.push(`**Basis:** ${d.score_basis}`);
  // Scored from other inputs (DB entity, sanctions), but the transfer side was missing.
  if (d.exposure?.data_unavailable || d.data_availability?.transfers === "unavailable") {
    const why = unavailableDetail(d);
    lines.push(`**Counterparty Exposure:** not scored — ${why}.${notClean(why)} The score above does not include transfer exposure.`);
  }
  return lines;
}

export interface TraceStatusInput {
  status: string | null | undefined;
  chain: string | null | undefined;
  attacker_address: string | null | undefined;
  edgeCount: number;
}

/** The closing status line of get_trace_status. "✅" only for a trace that holds transfers. */
export function traceStatusLine(inc: TraceStatusInput): string {
  const status = (inc.status ?? "unknown").toLowerCase();

  if (!isTraceableChain(inc.chain)) {
    return `⚪ ${tracingUnavailableMessage(inc.chain)}. ChainHint traces 12 networks; this incident and its loss figure come from the hack feed, and no fund flow was fetched. That is final, and it is not evidence that the funds did not move.`;
  }
  if (inc.edgeCount > 0 && (status === "traced" || status === "monitoring")) {
    return `✅ Trace complete — full flow graph and counterparty exposure on ChainHint.`;
  }
  if (status === "analyzing") return `⏳ Trace in progress...`;
  if (!inc.attacker_address) {
    return `⚪ Not traced — this incident has no attacker address to trace from.`;
  }
  if (status === "traced" || status === "monitoring") {
    return `⚠️ No transfers in the stored trace. This is not evidence that the funds are dormant: the chain's transfer provider may have been unavailable, or the address may not belong to this chain.`;
  }
  return `⚠️ Status: ${status}`;
}

/**
 * HTTP errors. A 422 is ChainHint's final answer ("Tracing not available for
 * Sui") — say so, so an agent does not retry it as a transient failure.
 */
export function apiErrorMessage(status: number, bodyError: string | undefined, url: string, resetAt?: number): string {
  let msg = bodyError ?? `HTTP ${status}: ${url}`;
  if (status === 422) msg += " (final answer — not a temporary error; do not retry)";
  if (status === 429 && resetAt) msg += ` Resets at ${new Date(resetAt * 1000).toISOString()}.`;
  if (status === 503) msg += " (the data provider is unavailable — this is not a clean result)";
  return msg;
}
