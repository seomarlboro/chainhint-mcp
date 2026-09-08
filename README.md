# ChainHint MCP Server

Crypto risk intelligence for Claude Desktop, Cursor, and any MCP-compatible AI.

## Tools

| Tool | Description | Limit |
|------|-------------|-------|
| `check_wallet_risk` | Fast risk score, entity, labels, sanctions hit (54M+ labeled addresses) | **3 / day** free · 10,000 / day with key |
| `lookup_address` | Deep address report — entity, risk factors, GoPlus flags, counterparty exposure, balance | **10 / day** free · 100 / hour with key |
| `get_trace_status` | Fund-trace summary for a public hack incident — hops, endpoints by type (exchange/mixer/bridge/defi), exposure | Unlimited |

## Requirements

- Node.js 18+
- Nothing else. **No API key needed to start** — every tool has a free daily allowance (per IP). An Agency plan key (`ch_live_...`, [chainhint.com/settings](https://chainhint.com/settings)) lifts the limits.

## Install

No install needed — run straight from npm with `npx` (see configs below).

From source instead:

```bash
git clone https://github.com/seomarlboro/chainhint-mcp
cd chainhint-mcp
npm install
npm run build
# then use "command": "node", "args": ["/absolute/path/to/chainhint-mcp/dist/index.js"]
```

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chainhint": {
      "command": "npx",
      "args": ["-y", "chainhint-mcp"]
    }
  }
}
```

## Cursor

Add to `.cursor/mcp.json` in your project (or global `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "chainhint": {
      "command": "npx",
      "args": ["-y", "chainhint-mcp"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add chainhint -- npx -y chainhint-mcp
```

## Lifting the free limits

Add an Agency key to the server entry (any client):

```json
"env": { "CHAINHINT_API_KEY": "ch_live_your_key_here" }
```

## What the agent sees

```
## Wallet Risk Report: 0x47666f...9486e2
**Chain:** ethereum
**Risk Score:** 85/100 — **CRITICAL**
**Entity:** Bybit Hack Exploiter (hacker)
**Labels:** Hacker/Exploiter, Bybit Hack Exploiter
**In ChainHint DB:** yes (sources: chainhint:manual)

Free tier: 2 of 3 checks left today — set CHAINHINT_API_KEY (Agency plan, https://chainhint.com/pricing) for 10,000/day.
```

When the address is in ChainHint's agent-infrastructure registry (agent-token launchpads, deployer factories, routers, payment facilitators, known agent wallets), the report adds an `🤖` line, e.g. *Known agent infrastructure: Virtuals launchpad* — a registry fact you can verify at its source, not a behavioural classification and not part of the risk score.

## Development (no build step)

```bash
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHAINHINT_API_KEY` | — | Agency plan key from chainhint.com. Lifts the free limits (3 checks + 10 lookups per day) to 10,000 / day |
| `CHAINHINT_API_URL` | — | Override API base URL (default: production) |
| `CHAINHINT_SUPABASE_ANON_KEY` | — | Override anon key for get_trace_status (public incidents) |

## Example prompts

> "Check if 0x47666fab8bd0ac7003bce3f5c3585383f09486e2 is a known hacker"

> "Look up the Bybit attacker address on Ethereum"

> "What's the trace status for attacker 0x47666fab..."
