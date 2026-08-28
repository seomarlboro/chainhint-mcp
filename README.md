# ChainHint MCP Server

Crypto risk intelligence for Claude Desktop, Cursor, and any MCP-compatible AI.

## Tools

| Tool | Description |
|------|-------------|
| `check_wallet_risk` | Risk score, entity label, sanctions check for any wallet |
| `lookup_address` | Full address details — entity, category, tx history |
| `get_trace_status` | Fund trace status for hack incidents — where did the money go? |

## Requirements

- Node.js 18+
- ChainHint Agency plan API key (`ch_live_...`) from [chainhint.com/settings](https://chainhint.com/settings)

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
      "args": ["-y", "chainhint-mcp"],
      "env": {
        "CHAINHINT_API_KEY": "ch_live_your_key_here"
      }
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
      "args": ["-y", "chainhint-mcp"],
      "env": {
        "CHAINHINT_API_KEY": "ch_live_your_key_here"
      }
    }
  }
}
```

## Development (no build step)

```bash
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHAINHINT_API_KEY` | ✅ | API key from chainhint.com (Agency plan) |
| `CHAINHINT_API_URL` | — | Override API base URL (default: production) |
| `CHAINHINT_SUPABASE_ANON_KEY` | — | For get_trace_status (public incidents) |

## Example prompts

> "Check if 0x47666fab8bd0ac7003bce3f5c3585383f09486e2 is a known hacker"

> "Look up the Bybit attacker address on Ethereum"

> "What's the trace status for attacker 0x47666fab..."
