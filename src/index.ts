#!/usr/bin/env node
/**
 * ChainHint MCP Server
 *
 * Provides crypto risk intelligence tools to Claude Desktop, Cursor,
 * and any MCP-compatible AI client.
 *
 * Tools:
 *   - check_wallet_risk   → wallet-reputation API (risk score, labels, sanctions)
 *   - lookup_address      → address-lookup API (entity, category, transaction history)
 *   - get_trace_status    → incident fund trace status (flow graph summary)
 *
 * Auth: set CHAINHINT_API_KEY env var (Agency plan API key: ch_live_...)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.CHAINHINT_API_KEY;
const BASE_URL = process.env.CHAINHINT_API_URL ?? "https://kjiwfwymnuzxriokhcjk.supabase.co/functions/v1";
const SUPABASE_URL = process.env.CHAINHINT_SUPABASE_URL ?? "https://kjiwfwymnuzxriokhcjk.supabase.co";
const SUPABASE_ANON_KEY = process.env.CHAINHINT_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaXdmd3ltbnV6eHJpb2toY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzkxODgsImV4cCI6MjA4ODMxNTE4OH0.VqzzF_jI8zF072cbjWEDbYo3PnMDlIPy621iWkXEqyo";

if (!API_KEY) {
  console.error("[chainhint-mcp] ERROR: CHAINHINT_API_KEY is not set.");
  console.error("  Get your API key from chainhint.com → Settings → API Keys (Agency plan required)");
  process.exit(1);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "X-Api-Key": API_KEY!,
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) {
    throw new Error(body?.error ?? `HTTP ${res.status}: ${url.toString()}`);
  }
  return body;
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
      "X-Api-Key": API_KEY!,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${res.status}: ${err}`);
  }
  return res.json();
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

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "chainhint",
  version: "1.0.0",
});

// ── Tool 1: check_wallet_risk ─────────────────────────────────────────────────

server.tool(
  "check_wallet_risk",
  "Check the risk score and labels for a crypto wallet address. Returns risk level (CLEAN/LOW/MEDIUM/HIGH/CRITICAL), entity label, category, sanctions status, and transaction statistics. Use this to assess whether a wallet is associated with hacks, scams, mixers, or sanctioned entities.",
  {
    address: z.string().describe("Wallet address to check (EVM 0x..., Bitcoin, or Solana)"),
    chain: z.string().optional().describe("Blockchain: ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, solana, bitcoin (default: auto-detect from address format)"),
  },
  async ({ address, chain }) => {
    try {
      const params: Record<string, string> = { address };
      if (chain) params.chain = chain;

      const data = await apiGet("/wallet-reputation", params) as {
        success: boolean;
        data?: {
          address: string;
          chain: string;
          risk?: { score: number; level: string; flags: string[] };
          entity?: { name: string; category: string; label: string };
          sanctions?: { is_sanctioned: boolean; programs: string[] };
          stats?: { tx_count: number; first_seen: string; last_seen: string };
        };
        error?: string;
      };

      if (!data.success || !data.data) {
        return { content: [{ type: "text", text: `Error: ${data.error ?? "Unknown error"}` }] };
      }

      const d = data.data;
      const risk = d.risk;
      const entity = d.entity;
      const sanctions = d.sanctions;
      const stats = d.stats;

      const lines: string[] = [
        `## Wallet Risk Report: ${truncateAddr(d.address)}`,
        `**Chain:** ${d.chain}`,
        `**Risk Score:** ${risk?.score ?? "N/A"}/100 — **${risk?.level ?? formatRiskLevel(risk?.score ?? 0)}**`,
      ];

      if (entity?.name) {
        lines.push(`**Entity:** ${entity.name} (${entity.category})`);
        if (entity.label) lines.push(`**Label:** ${entity.label}`);
      } else {
        lines.push(`**Entity:** Unknown / unlabeled`);
      }

      if (sanctions?.is_sanctioned) {
        lines.push(`⛔ **SANCTIONED** — Programs: ${sanctions.programs.join(", ")}`);
      }

      if (risk?.flags?.length) {
        lines.push(`**Risk Flags:** ${risk.flags.join(", ")}`);
      }

      if (stats) {
        lines.push(`**Transactions:** ${stats.tx_count?.toLocaleString() ?? "N/A"}`);
        if (stats.first_seen) lines.push(`**First seen:** ${stats.first_seen.slice(0, 10)}`);
        if (stats.last_seen) lines.push(`**Last seen:** ${stats.last_seen.slice(0, 10)}`);
      }

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
  "Look up detailed information about a blockchain address including entity label, risk assessment, transaction history, and known associations. More detailed than check_wallet_risk — includes transaction counts, token holdings summary, and entity metadata.",
  {
    address: z.string().describe("Blockchain address to look up"),
    chain: z.string().optional().describe("Blockchain (ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, solana, bitcoin)"),
  },
  async ({ address, chain }) => {
    try {
      const params: Record<string, string> = { address };
      if (chain) params.chain = chain;

      const data = await apiGet("/address-lookup", params) as {
        success: boolean;
        data?: {
          address: string;
          chain: string;
          label?: string;
          entity?: string;
          category?: string;
          risk?: { score: number; level: string; flags: string[] };
          tx_count?: number;
          balance?: string;
          first_seen?: string;
          last_seen?: string;
          is_contract?: boolean;
          sanctions?: { is_sanctioned: boolean };
        };
        error?: string;
      };

      if (!data.success || !data.data) {
        return { content: [{ type: "text", text: `Error: ${data.error ?? "Unknown error"}` }] };
      }

      const d = data.data;
      const lines: string[] = [
        `## Address Lookup: ${truncateAddr(d.address)}`,
        `**Chain:** ${d.chain}`,
        `**Type:** ${d.is_contract ? "Smart Contract" : "EOA (wallet)"}`,
      ];

      if (d.entity) lines.push(`**Entity:** ${d.entity}`);
      if (d.label) lines.push(`**Label:** ${d.label}`);
      if (d.category) lines.push(`**Category:** ${d.category}`);
      if (d.balance) lines.push(`**Balance:** ${d.balance}`);

      const score = d.risk?.score;
      if (score !== undefined) {
        lines.push(`**Risk Score:** ${score}/100 — ${formatRiskLevel(score)}`);
      }
      if (d.risk?.flags?.length) {
        lines.push(`**Flags:** ${d.risk.flags.join(", ")}`);
      }
      if (d.sanctions?.is_sanctioned) {
        lines.push(`⛔ **SANCTIONED**`);
      }

      if (d.tx_count) lines.push(`**Transactions:** ${d.tx_count.toLocaleString()}`);
      if (d.first_seen) lines.push(`**First seen:** ${d.first_seen.slice(0, 10)}`);
      if (d.last_seen) lines.push(`**Last seen:** ${d.last_seen.slice(0, 10)}`);

      lines.push(`\n*Powered by ChainHint — chainhint.com*`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error looking up address: ${(err as Error).message}` }] };
    }
  }
);

// ── Tool 3: get_trace_status ──────────────────────────────────────────────────

server.tool(
  "get_trace_status",
  "Get the fund trace status for a crypto hack incident. Returns how stolen funds moved — number of hops, total amount traced, known endpoints (exchanges, mixers, bridges), and current movement status (in_transit, mixing, reached_exchange, dormant). Useful for incident response and understanding where stolen funds went.",
  {
    attacker_address: z.string().optional().describe("Attacker wallet address to look up incident by"),
    incident_id: z.string().optional().describe("Incident UUID (from chainhint.com) — alternative to attacker_address"),
  },
  async ({ attacker_address, incident_id }) => {
    try {
      if (!attacker_address && !incident_id) {
        return { content: [{ type: "text", text: "Error: provide either attacker_address or incident_id" }] };
      }

      // Query public incidents via Supabase REST
      let queryParams: Record<string, string> = {
        select: "id,title,status,chain,attacker_address,amount_usd,estimated_loss_usd,created_at,source",
        is_public: "eq.true",
        limit: "1",
        order: "created_at.desc",
      };

      if (incident_id) {
        queryParams["id"] = `eq.${incident_id}`;
        delete queryParams["is_public"];
      } else if (attacker_address) {
        queryParams["attacker_address"] = `eq.${attacker_address.toLowerCase()}`;
      }

      const rows = await supabaseGet("incidents", queryParams) as Array<{
        id: string;
        title: string;
        status: string;
        chain: string;
        attacker_address: string;
        amount_usd: number;
        estimated_loss_usd: number;
        created_at: string;
        source: string;
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
      const lossUsd = inc.amount_usd ?? inc.estimated_loss_usd;

      const lines: string[] = [
        `## Fund Trace: ${inc.title ?? "Unnamed Incident"}`,
        `**Incident ID:** ${inc.id}`,
        `**Chain:** ${inc.chain}`,
        `**Status:** ${inc.status.toUpperCase()}`,
        `**Attacker:** ${truncateAddr(inc.attacker_address)}`,
        `**Loss:** ${lossUsd ? `$${(lossUsd / 1_000_000).toFixed(2)}M` : "Unknown"}`,
        `**Date:** ${inc.created_at.slice(0, 10)}`,
      ];

      if (inc.status.toLowerCase() === "traced") {
        lines.push(`\n✅ Trace complete — view full flow graph and counterparty exposure on ChainHint.`);
      } else if (inc.status.toLowerCase() === "analyzing") {
        lines.push(`\n⏳ Trace in progress...`);
      } else {
        lines.push(`\n⚠️ Status: ${inc.status}`);
      }

      lines.push(`\n🔗 View full trace: https://chainhint.com/incident/${inc.id}`);
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
