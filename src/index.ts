#!/usr/bin/env node
/**
 * ChainHint MCP Server
 *
 * Provides crypto risk intelligence tools to Claude Desktop, Cursor,
 * and any MCP-compatible AI client.
 *
 * Tools:
 *   - check_wallet_risk   → wallet-reputation API (risk score, labels, sanctions) — needs API key
 *   - lookup_address      → address-lookup API (entity, risk factors, exposure, balance) — public
 *   - get_trace_status    → public incident fund-trace summary (endpoints, hops, exposure) — public
 *
 * Auth: works without a key. check_wallet_risk has a free tier of 3 checks
 * per IP per day; lookup_address 10 per day; get_trace_status is unlimited.
 * CHAINHINT_API_KEY (Agency plan, ch_live_...) lifts the limits to 10,000/day.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.CHAINHINT_API_KEY;
const BASE_URL = process.env.CHAINHINT_API_URL ?? "https://kjiwfwymnuzxriokhcjk.supabase.co/functions/v1";
const SUPABASE_URL = process.env.CHAINHINT_SUPABASE_URL ?? "https://kjiwfwymnuzxriokhcjk.supabase.co";
const SUPABASE_ANON_KEY = process.env.CHAINHINT_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaXdmd3ltbnV6eHJpb2toY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzkxODgsImV4cCI6MjA4ODMxNTE4OH0.VqzzF_jI8zF072cbjWEDbYo3PnMDlIPy621iWkXEqyo";

const VERSION = "1.1.0";
const USER_AGENT = `chainhint-mcp/${VERSION}`;
const FREE_CHECKS_PER_DAY = 3;
const UPGRADE_HINT = "set CHAINHINT_API_KEY (Agency plan, https://chainhint.com/pricing) for 10,000/day";

if (!API_KEY) {
  console.error(`[chainhint-mcp] No CHAINHINT_API_KEY — running on the free tier (${FREE_CHECKS_PER_DAY} wallet checks + 10 lookups per day per IP).`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type ApiResult<T> = { body: T; headers: Headers };

async function apiGet<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<ApiResult<T>> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  // User-Agent lets the backend attribute traffic (api_usage_log.caller) and
  // apply the MCP-specific free allowance. The key, when present, goes in
  // X-Api-Key so both wallet-reputation and address-lookup recognise it.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (API_KEY) {
    headers["X-Api-Key"] = API_KEY;
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const res = await fetch(url.toString(), { headers });
  const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & {
    error?: string;
    reset_at?: number;
  };
  if (!res.ok) {
    let msg = body?.error ?? `HTTP ${res.status}: ${url.toString()}`;
    if (res.status === 429 && body?.reset_at) {
      msg += ` Resets at ${new Date(body.reset_at * 1000).toISOString()}.`;
    }
    throw new Error(msg);
  }
  return { body, headers: res.headers };
}

/** "Free tier: 2 of 3 checks left today — set CHAINHINT_API_KEY …" or null. */
function quotaLine(headers: Headers, what: string): string | null {
  if (headers.get("x-chainhint-tier") !== "free") return null;
  const limit = Number(headers.get("x-ratelimit-limit"));
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return null;
  // Bypass-listed IPs get MAX_SAFE_INTEGER from the backend — no quota to report.
  if (limit >= 1_000_000) return null;
  const reset = Number(headers.get("x-ratelimit-reset"));
  const resetStr = Number.isFinite(reset) && reset > 0 ? ` (resets ${new Date(reset * 1000).toISOString().slice(0, 16)}Z)` : "";
  return `Free tier: ${remaining} of ${limit} ${what} left today${resetStr} — ${UPGRADE_HINT}.`;
}

async function supabaseGet(table: string, params: Record<string, string>): Promise<unknown[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res.json() as Promise<unknown[]>;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatRiskLevel(score: number): string {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 10) return "LOW";
  return "CLEAN";
}

function truncateAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
}

// Same tiers as the site's formatUsd (src/lib/utils.ts): $1.4B, $115.0M, $629.4K.
// KIR-45: this used to stop at "M" and print "$1409.97M" for the Bybit loss.
function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Unknown";
  const abs = Math.abs(n);
  if (abs >= 1e15) return "Unknown";
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// Hop count as the site counts it (src/lib/traceReconciliation deriveDepthMap):
// shortest-path depth from the attacker over the edges, max over reachable
// nodes — NOT max(edge.depth), which the tracer assigns as it walks (Bybit:
// 6 vs the site's 5).
function hopCount(edges: { from?: string; to: string }[], attacker: string | null | undefined): number {
  const src = (attacker ?? "").toLowerCase();
  if (!src || !edges.length) return 0;
  const out = new Map<string, string[]>();
  for (const e of edges) {
    const f = (e.from ?? "").toLowerCase(), t = (e.to ?? "").toLowerCase();
    if (!f || !t) continue;
    (out.get(f) ?? out.set(f, []).get(f)!).push(t);
  }
  const depth = new Map<string, number>([[src, 0]]);
  const queue = [src];
  let max = 0;
  while (queue.length) {
    const a = queue.shift()!;
    const d = depth.get(a)!;
    for (const b of out.get(a) ?? []) {
      if (depth.has(b)) continue;
      depth.set(b, d + 1);
      if (d + 1 > max) max = d + 1;
      queue.push(b);
    }
  }
  return max;
}

// Endpoint buckets as the site's Flow Summary (src/lib/flowSummary.ts): the
// entity CATEGORY decides — an attacker wallet retyped "exchange" is not an
// exchange, a no-KYC swap is not a freeze target.
const ATTACKER_CATEGORIES = new Set(["hacker", "scam", "exploit"]);
const NO_KYC_TOKENS = ["changenow", "fixedfloat", "simpleswap", "sideshift", "stealthex", "changelly", "letsexchange", "godex", "swapuz", "exolix", "exch.cx", "exch.sc", "exch.net", "ff.io"];
function endpointBucket(category: string | null | undefined, type: string | null | undefined, name: string | null | undefined): string {
  const c = (category ?? "").toLowerCase();
  const t = (type ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (ATTACKER_CATEGORIES.has(c)) return "attacker-attributed";
  if (c === "sanctioned" || c === "high_risk_exchange" || NO_KYC_TOKENS.some((k) => n.includes(k.replace(/[\s_-]/g, "")))) return "risky";
  if (c === "mixer" || t === "mixer") return "mixer";
  if (c === "bridge" || t === "bridge") return "bridge";
  if (c === "exchange" || t === "exchange") return "exchange";
  if (c === "defi" || c === "dex" || t === "defi" || t === "dex") return "defi";
  return "unknown";
}

// EVM addresses are case-insensitive and stored lowercase; base58 chains
// (BTC/TRON/SOL/TON) are case-sensitive — never lowercase those.
function normalizeAddr(addr: string): string {
  const a = addr.trim();
  return a.startsWith("0x") ? a.toLowerCase() : a;
}

type ExposureBucket = {
  category: string;
  usd: number;
  pct: number;
  counterparties: number;
  top_entities: string[];
};

function formatExposure(label: string, buckets: ExposureBucket[] | undefined): string[] {
  if (!buckets?.length) return [];
  const sorted = [...buckets].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)).slice(0, 5);
  return [
    `**${label}:**`,
    ...sorted.map((b) => {
      const who = b.top_entities?.length ? ` — ${b.top_entities.slice(0, 3).join(", ")}` : "";
      return `- ${b.category}: ${usd(b.usd)} (${b.pct}%, ${b.counterparties} counterpart${b.counterparties === 1 ? "y" : "ies"})${who}`;
    }),
  ];
}

type PublicIncidentRow = {
  id: string;
  title: string | null;
  chain: string;
  amount_usd: number | null;
  estimated_loss_usd: number | null;
  risk_score: number | null;
};

/** Public incident whose attacker_address matches, or null (errors swallowed — best effort). */
async function findPublicIncidentByAttacker(address: string): Promise<PublicIncidentRow | null> {
  try {
    const rows = await supabaseGet("public_incidents_view", {
      select: "id,title,chain,amount_usd,estimated_loss_usd,risk_score",
      attacker_address: `eq.${normalizeAddr(address)}`,
      limit: "1",
    }) as PublicIncidentRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "chainhint",
  version: VERSION,
});

// ── Tool 1: check_wallet_risk ─────────────────────────────────────────────────

server.tool(
  "check_wallet_risk",
  "Fast risk check for a crypto wallet address against ChainHint's 54M+ labeled address database (12 chains). Returns risk score 0-100, risk level (clean/low/medium/high/critical/sanctioned), entity name and category, labels, and sanctions hit. Use it to decide allow/warn/block before paying or interacting with a counterparty wallet. Free: 3 checks per day without a key; CHAINHINT_API_KEY (Agency plan) lifts it to 10,000/day. For a deeper report (risk factors, exposure, balance) use lookup_address.",
  {
    address: z.string().describe("Wallet address to check (EVM 0x..., Bitcoin, or Solana)"),
    chain: z.string().optional().describe("Blockchain: ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, gnosis, bitcoin, solana, tron, ton (default: auto-detect from address format; the response chain is the address family for bitcoin/solana/tron/ton)"),
  },
  async ({ address, chain }) => {
    try {
      const params: Record<string, string> = { address };
      if (chain) params.chain = chain;

      // wallet-reputation returns a flat object (no {success,data} wrapper).
      const { body: d, headers } = await apiGet<{
        address: string;
        chain: string;
        risk_score: number;
        risk_level: string;
        category: string | null;
        entity: { name: string; category: string; subcategory: string | null; verified: boolean } | null;
        labels: string[];
        sanctions: { hit: boolean };
        is_contract: boolean | null;
        found_in_db: boolean;
        sources: string[];
        checked_at: string;
        tier?: "free" | "api_key" | "x402";
        // Agent-infrastructure overlay: registry membership of known
        // autonomous-agent infra (launchpads, factories, facilitators, agent
        // wallets). A registry fact, never a behavioural classification.
        agent?: {
          is_agent: boolean;
          kind: string;
          framework: string;
          label: string;
          summary: string;
          source_url: string;
        } | null;
      }>("/wallet-reputation", params);

      const lines: string[] = [
        `## Wallet Risk Report: ${truncateAddr(d.address)}`,
        `**Address:** ${d.address}`,
        `**Chain:** ${d.chain}`,
      ];

      // Canon (same as chainhint.com and the TG bot): an address that is not in
      // the labeled database has NO DATA — that is not evidence it is clean.
      // The API still returns risk_score 0 / "clean" for not-found, so the
      // wording is fixed here, and public incidents are cross-checked so a
      // known hack attacker that never got an `addresses` row is not
      // presented as unknown.
      if (!d.found_in_db) {
        lines.push(`**Risk:** ⚪ NO DATA — address is not in ChainHint's labeled database. This is not evidence it is clean.`);
        const inc = await findPublicIncidentByAttacker(d.address);
        if (inc) {
          lines.push(
            `⚠️ **Known attacker in a public hack incident:** ${inc.title ?? "Unnamed incident"} (${inc.chain}, loss ${usd(inc.amount_usd ?? inc.estimated_loss_usd)}${inc.risk_score != null ? `, incident risk ${inc.risk_score}/100` : ""}). Treat as HIGH risk.`,
            `🔗 https://chainhint.com/incident/${inc.id}`,
          );
        }
        lines.push(`Use lookup_address for an on-chain assessment (risk factors, GoPlus flags, counterparty exposure).`);
      } else {
        lines.push(`**Risk Score:** ${d.risk_score}/100 — **${(d.risk_level ?? formatRiskLevel(d.risk_score)).toUpperCase()}**`);
      }

      if (d.sanctions?.hit) {
        lines.push(`⛔ **SANCTIONED / OFAC-linked**`);
      }

      if (d.entity?.name) {
        const sub = d.entity.subcategory ? ` / ${d.entity.subcategory}` : "";
        const ver = d.entity.verified ? ", verified" : "";
        lines.push(`**Entity:** ${d.entity.name} (${d.entity.category}${sub}${ver})`);
      } else if (d.category) {
        lines.push(`**Category:** ${d.category}`);
      } else {
        lines.push(`**Entity:** Unknown / unlabeled`);
      }

      if (d.labels?.length) lines.push(`**Labels:** ${[...new Set(d.labels)].join(", ")}`);
      if (d.agent) {
        // Registry fact (agent launchpad / factory / facilitator / wallet), not
        // a behavioural classification — mirrors the API's honest wording.
        const cap = d.agent.summary.charAt(0).toUpperCase() + d.agent.summary.slice(1);
        lines.push(`🤖 **${cap}** — a registry fact, not a behavioural classification.`);
      }
      if (d.is_contract != null) lines.push(`**Type:** ${d.is_contract ? "Smart Contract" : "EOA (wallet)"}`);
      lines.push(`**In ChainHint DB:** ${d.found_in_db ? "yes" : "no"}${d.sources?.length ? ` (sources: ${d.sources.join(", ")})` : ""}`);
      lines.push(`**Checked at:** ${d.checked_at}`);

      const quota = quotaLine(headers, "checks");
      if (quota) lines.push(``, quota);
      lines.push(`\n*Powered by ChainHint — chainhint.com*`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error checking wallet: ${(err as Error).message}` }] };
    }
  }
);

// ── Tool 2: lookup_address ────────────────────────────────────────────────────

server.tool(
  "lookup_address",
  "Detailed lookup of a blockchain address: entity attribution, risk score with the factors behind it, sanctions and GoPlus security flags, counterparty exposure (where funds came from / went to, by category with named entities), balance, token count and transaction count. Free: 10 lookups per day without a key; CHAINHINT_API_KEY lifts it. Supports EVM chains, Bitcoin, Solana, TRON, TON.",
  {
    address: z.string().describe("Blockchain address to look up"),
    chain: z.string().optional().describe("Blockchain (ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, gnosis, bitcoin, solana, tron, ton)"),
  },
  async ({ address, chain }) => {
    try {
      const params: Record<string, string> = { address };
      if (chain) params.chain = chain;

      const { body: data, headers: lookupHeaders } = await apiGet<{
        success: boolean;
        data?: {
          address: string;
          chain: string;
          risk?: { score: number; level: string; factors?: Record<string, boolean>; details?: string[] };
          entity?: { name: string; category: string; subcategory?: string | null; verified?: boolean; confidence?: number; source?: string } | null;
          labels?: string[];
          is_contract?: boolean;
          sanctions?: { identifications?: Array<{ name?: string; program?: string; url?: string }> };
          goplus?: Record<string, string>;
          balance_usd?: number;
          tx_count?: number;
          tokens?: unknown[];
          exposure?: {
            inflow?: ExposureBucket[];
            outflow?: ExposureBucket[];
            total_in_usd?: number;
            total_out_usd?: number;
            counterparties_total?: number;
            counterparties_identified?: number;
            risk?: { level: string; pct: number; details?: string[] };
            window?: string;
          };
          risk_status?: string;
          degraded?: unknown;
          agent?: {
            is_agent: boolean;
            kind: string;
            framework: string;
            label: string;
            summary: string;
            source_url: string;
          } | null;
        };
        error?: string;
      }>("/address-lookup", params);

      if (!data.success || !data.data) {
        return { content: [{ type: "text", text: `Error: ${data.error ?? "Unknown error"}` }] };
      }

      const d = data.data;
      const lines: string[] = [
        `## Address Lookup: ${truncateAddr(d.address)}`,
        `**Address:** ${d.address}`,
        `**Chain:** ${d.chain}`,
        `**Type:** ${d.is_contract ? "Smart Contract" : "EOA (wallet)"}`,
      ];

      if (d.entity?.name) {
        const sub = d.entity.subcategory ? ` / ${d.entity.subcategory}` : "";
        const conf = d.entity.confidence != null ? `, confidence ${Math.round(d.entity.confidence * 100)}%` : "";
        lines.push(`**Entity:** ${d.entity.name} (${d.entity.category}${sub}${conf})`);
      } else {
        lines.push(`**Entity:** Unknown / unlabeled`);
      }

      if (d.agent) {
        const cap = d.agent.summary.charAt(0).toUpperCase() + d.agent.summary.slice(1);
        lines.push(`🤖 **${cap}** — a registry fact, not a behavioural classification.`);
      }
      if (d.labels?.length) lines.push(`**Labels:** ${[...new Set(d.labels)].join(", ")}`);

      if (d.risk) {
        const level = (d.risk.level ?? formatRiskLevel(d.risk.score)).toUpperCase();
        lines.push(`**Risk Score:** ${d.risk.score}/100 — **${level}**`);
        const factors = Object.entries(d.risk.factors ?? {}).filter(([, v]) => v).map(([k]) => k);
        if (factors.length) lines.push(`**Risk Factors:** ${factors.join(", ")}`);
        if (d.risk.details?.length) lines.push(`**Risk Details:** ${d.risk.details.join("; ")}`);
      }

      const sanctionIds = d.sanctions?.identifications ?? [];
      if (sanctionIds.length) {
        const names = sanctionIds.map((s) => [s.name, s.program].filter(Boolean).join(" / ")).filter(Boolean);
        lines.push(`⛔ **SANCTIONED** — ${names.join("; ") || `${sanctionIds.length} identification(s)`}`);
      }

      const goplusFlags = Object.entries(d.goplus ?? {})
        .filter(([k, v]) => v === "1" && k !== "contract_address")
        .map(([k]) => k);
      if (goplusFlags.length) lines.push(`**GoPlus Security Flags:** ${goplusFlags.join(", ")}`);

      if (d.balance_usd != null) lines.push(`**Balance:** ${usd(d.balance_usd)}${d.tokens?.length ? ` across ${d.tokens.length} asset(s)` : ""}`);
      if (d.tx_count != null) lines.push(`**Transactions:** ${d.tx_count.toLocaleString()}`);

      const ex = d.exposure;
      if (ex && (ex.inflow?.length || ex.outflow?.length)) {
        lines.push(``, `### Counterparty Exposure (${ex.window ?? "recent transfers"})`);
        if (ex.risk?.level) {
          lines.push(`**Exposure Risk:** ${ex.risk.level.toUpperCase()} (${ex.risk.pct}% of volume to/from risky counterparties)`);
          if (ex.risk.details?.length) lines.push(...ex.risk.details.map((s) => `- ${s}`));
        }
        lines.push(`**Volume:** in ${usd(ex.total_in_usd)}, out ${usd(ex.total_out_usd)}; ${ex.counterparties_identified ?? 0}/${ex.counterparties_total ?? 0} counterparties identified`);
        lines.push(...formatExposure("Inflow by category", ex.inflow));
        lines.push(...formatExposure("Outflow by category", ex.outflow));
      }

      const lookupQuota = quotaLine(lookupHeaders, "lookups");
      if (lookupQuota) lines.push(``, lookupQuota);
      lines.push(``, `🔗 https://chainhint.com/address/${d.address}?chain=${d.chain}`);
      lines.push(`*Powered by ChainHint — chainhint.com*`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error looking up address: ${(err as Error).message}` }] };
    }
  }
);

// ── Tool 3: get_trace_status ──────────────────────────────────────────────────

type Endpoint = {
  address: string;
  type?: string;
  entity?: string | null;
  entity_name?: string | null;
  entity_category?: string | null;
  amount_usd?: number | null;
};

server.tool(
  "get_trace_status",
  "Fund-trace summary for a publicly tracked crypto hack incident on ChainHint. Returns incident status, estimated loss, trace depth (hops) and graph size, where the stolen funds ended up (endpoints grouped by type: exchange, mixer, bridge, defi, unknown — with named entities and USD amounts), and the attacker's counterparty exposure. Look up by attacker address or ChainHint incident UUID. Works without an API key.",
  {
    attacker_address: z.string().optional().describe("Attacker wallet address to look up incident by"),
    incident_id: z.string().optional().describe("Incident UUID (from chainhint.com) — alternative to attacker_address"),
  },
  async ({ attacker_address, incident_id }) => {
    try {
      if (!attacker_address && !incident_id) {
        return { content: [{ type: "text", text: "Error: provide either attacker_address or incident_id" }] };
      }

      // public_incidents_view is the canonical anonymous read path (SECURITY DEFINER,
      // exposes only is_public rows and only public-safe columns).
      const queryParams: Record<string, string> = {
        select: "id,title,status,chain,attacker_address,amount_usd,estimated_loss_usd,risk_score,incident_type,hack_date,display_date,created_at,updated_at,source,endpoints,flow_graph,counterparty_exposure",
        limit: "1",
        order: "created_at.desc",
      };

      if (incident_id) {
        queryParams["id"] = `eq.${incident_id}`;
      } else if (attacker_address) {
        queryParams["attacker_address"] = `eq.${normalizeAddr(attacker_address)}`;
      }

      const rows = await supabaseGet("public_incidents_view", queryParams) as Array<{
        id: string;
        title: string | null;
        status: string;
        chain: string;
        attacker_address: string;
        amount_usd: number | null;
        estimated_loss_usd: number | null;
        risk_score: number | null;
        incident_type: string | null;
        hack_date: string | null;
        display_date: string | null;
        created_at: string;
        updated_at: string | null;
        source: string | null;
        endpoints: Endpoint[] | null;
        flow_graph: { nodes?: unknown[]; edges?: Array<{ depth?: number; from?: string; to: string; amount_usd?: number | null }> } | null;
        counterparty_exposure: {
          risk?: { level: string; pct: number; details?: string[] };
          inflow?: ExposureBucket[];
          outflow?: ExposureBucket[];
        } | null;
      }>;

      if (!rows?.length) {
        return {
          content: [{
            type: "text",
            text: attacker_address
              ? `No public incident found for attacker address ${attacker_address}.\nCheck https://chainhint.com/velocity for tracked incidents.`
              : `Incident ${incident_id} not found or not public.`,
          }],
        };
      }

      const inc = rows[0];
      // The site's figure: stored estimated_loss_usd first (TraceFacts.displayedLossUsd), amount_usd as fallback.
      const lossUsd = inc.estimated_loss_usd ?? inc.amount_usd;
      const date = inc.display_date ?? inc.hack_date ?? inc.created_at;
      const status = (inc.status ?? "unknown").toLowerCase();

      const lines: string[] = [
        `## Fund Trace: ${inc.title ?? "Unnamed Incident"}`,
        `**Incident ID:** ${inc.id}`,
        `**Chain:** ${inc.chain}`,
        `**Status:** ${status.toUpperCase()}`,
        `**Attacker:** ${inc.attacker_address}`,
        `**Loss:** ${usd(lossUsd)}`,
        `**Date:** ${date.slice(0, 10)}`,
      ];
      if (inc.incident_type) lines.push(`**Type:** ${inc.incident_type}`);
      if (inc.risk_score != null) lines.push(`**Risk Score:** ${inc.risk_score}/100`);
      if (inc.source) lines.push(`**Source:** ${inc.source}`);
      if (inc.updated_at) lines.push(`**Last traced:** ${inc.updated_at.slice(0, 10)}`);

      const edges = inc.flow_graph?.edges ?? [];
      const nodes = inc.flow_graph?.nodes ?? [];
      if (edges.length) {
        const hops = hopCount(edges, inc.attacker_address);
        lines.push(``, `### Trace Graph`);
        lines.push(`**Hops traced:** ${hops} · **Addresses:** ${nodes.length} · **Transfers:** ${edges.length}`);
      }

      const endpoints = inc.endpoints ?? [];
      // A graph none of whose edges carries amount_usd was never valued (legacy
      // Bitcoin rows): endpoint.amount_usd then holds the raw asset quantity and
      // must not be printed as dollars (multi-chain audit 2026-09-03).
      const graphPriced = edges.length === 0 || edges.some((e) => e.amount_usd != null && Number(e.amount_usd) > 0);
      const money = (n: number | null | undefined) => (graphPriced ? usd(n) : "unpriced");
      if (endpoints.length) {
        const byType = new Map<string, { usd: number; n: number; entities: Map<string, number> }>();
        for (const e of endpoints) {
          const t = endpointBucket(e.entity_category, e.type, e.entity_name ?? e.entity);
          const b = byType.get(t) ?? { usd: 0, n: 0, entities: new Map() };
          b.usd += e.amount_usd ?? 0;
          b.n += 1;
          const name = e.entity_name ?? e.entity;
          if (name) b.entities.set(name, (b.entities.get(name) ?? 0) + (e.amount_usd ?? 0));
          byType.set(t, b);
        }
        const totalUsd = [...byType.values()].reduce((s, b) => s + b.usd, 0);
        // Σ endpoint amounts counts every hop's inflow (multi-hop), so it is larger than the loss — name the base.
        lines.push(``, `### Where the funds went (${endpoints.length} endpoints, ${graphPriced ? `${usd(totalUsd)} observed at endpoints — not the loss figure` : "this trace carries no USD valuation"})`);
        for (const [t, b] of [...byType.entries()].sort((a, b) => b[1].usd - a[1].usd)) {
          const top = [...b.entities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
          const pct = totalUsd > 0 ? ` (${((b.usd / totalUsd) * 100).toFixed(1)}%)` : "";
          lines.push(`- **${t}**: ${money(b.usd)}${graphPriced ? pct : ""} across ${b.n} address(es)${top.length ? ` — ${top.join(", ")}` : ""}`);
        }
        const topEndpoints = [...endpoints]
          .filter((e) => (e.amount_usd ?? 0) > 0)
          .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
          .slice(0, 5);
        if (topEndpoints.length) {
          lines.push(`**Largest endpoints:**`);
          for (const e of topEndpoints) {
            const name = e.entity_name ?? e.entity ?? "unattributed";
            lines.push(`- ${truncateAddr(e.address)} — ${name} (${endpointBucket(e.entity_category, e.type, e.entity_name ?? e.entity)}): ${money(e.amount_usd)}`);
          }
        }
      }

      const cx = inc.counterparty_exposure;
      if (cx?.risk?.level || cx?.outflow?.length || cx?.inflow?.length) {
        lines.push(``, `### Attacker Counterparty Exposure`);
        if (cx.risk?.level) {
          lines.push(`**Exposure Risk:** ${cx.risk.level.toUpperCase()} (${cx.risk.pct}%)`);
          if (cx.risk.details?.length) lines.push(...cx.risk.details.slice(0, 5).map((s) => `- ${s}`));
        }
        lines.push(...formatExposure("Outflow by category", cx.outflow));
        lines.push(...formatExposure("Inflow by category", cx.inflow));
      }

      lines.push(``);
      if (status === "traced") {
        lines.push(`✅ Trace complete — full flow graph and counterparty exposure on ChainHint.`);
      } else if (status === "analyzing") {
        lines.push(`⏳ Trace in progress...`);
      } else {
        lines.push(`⚠️ Status: ${status}`);
      }

      lines.push(`🔗 View full trace: https://chainhint.com/incident/${inc.id}`);
      lines.push(`*Powered by ChainHint — chainhint.com*`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error fetching trace: ${(err as Error).message}` }] };
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[chainhint-mcp] Server running on stdio");
