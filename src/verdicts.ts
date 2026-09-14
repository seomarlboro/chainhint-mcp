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

export function formatRiskLevel(score: number): string {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 10) return "LOW";
  return "CLEAN";
}

export type DataUnavailable = { provider?: string; reason?: string };

export interface LookupRiskInput {
  risk?: { score: number; level?: string; factors?: Record<string, boolean>; details?: string[] };
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

/** The risk lines of lookup_address. Never a score when there was nothing to score. */
export function lookupRiskLines(d: LookupRiskInput): string[] {
  if (d.risk_status === "unavailable") {
    const why = unavailableDetail(d);
    return [`**Risk:** ⚪ DATA UNAVAILABLE — ${why}.${notClean(why)} No risk score was computed.`];
  }
  if (d.risk_status === "insufficient_data") {
    return [
      `**Risk:** ⚪ NOT SCORED — insufficient data. This is not evidence the address is clean.`,
    ];
  }
  if (!d.risk) return [];

  const level = (d.risk.level ?? formatRiskLevel(d.risk.score)).toUpperCase();
  const lines = [`**Risk Score:** ${d.risk.score}/100 — **${level}**`];
  const factors = Object.entries(d.risk.factors ?? {}).filter(([, v]) => v).map(([k]) => k);
  if (factors.length) lines.push(`**Risk Factors:** ${factors.join(", ")}`);
  if (d.risk.details?.length) lines.push(`**Risk Details:** ${d.risk.details.join("; ")}`);
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
