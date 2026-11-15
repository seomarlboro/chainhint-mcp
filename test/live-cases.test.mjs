// The four live cases of 2026-11-15, as an MCP client sees them: the real server over stdio
// against a stub that serves recorded, trimmed responses of the public API (test/fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withServer, ADDRESSES } from "./helpers/run-tools.mjs";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const NOTE = "An automated estimate from on-chain data and published labels — not a finding that anyone did anything wrong.";

async function all(extra) {
  const out = {};
  await withServer(dist, async (call) => {
    for (const [k, a] of Object.entries(ADDRESSES)) {
      out[k] = {
        wallet: await call("check_wallet_risk", { address: a, chain: "ethereum" }),
        lookup: await call("lookup_address", { address: a, chain: "ethereum" }),
      };
    }
  }, extra);
  return out;
}
const out = await all();

test("attributed, unverified: the name is never 'hacker' without its source", () => {
  for (const t of [out.attr.wallet, out.attr.lookup]) {
    assert.match(t, /\*\*Entity:\*\* Bybit Hack Exploiter — attributed by Bybit HackScan, unverified/);
    assert.doesNotMatch(t, /\(hacker/);
    assert.doesNotMatch(t, /\*\*Labels:\*\* Bybit Hack Exploiter/);
    assert.match(t, new RegExp(NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(out.attr.wallet, /sets a minimum of 70 on this address/); // the API's own note
});

test("a confirmed list is named, not hedged and not called unverified", () => {
  for (const t of [out.mixer.wallet, out.mixer.lookup]) {
    assert.match(t, /\*\*Entity:\*\* Tornado Cash — on Tornado Cash's own contract list\n/);
    assert.doesNotMatch(t, /\(mixer/);
  }
  assert.doesNotMatch(out.mixer.wallet, /\*\*Attribution:\*\*/);
  assert.match(out.mixer.lookup, /3:22-cv-20375/); // a citation beside it, no risk wording
});

test("a manual label with no source is a claim, with whose it is", () => {
  assert.match(out.manual.lookup, /\*\*Entity:\*\* Tornado Cash — mixer, unverified \(ChainHint manual entry\) — attributed on Arbitrum/);
  // wallet-reputation sends no entity source, so the marker cannot name it — it still says unverified
  assert.match(out.manual.wallet, /\*\*Entity:\*\* Tornado Cash — mixer, unverified — attributed on Arbitrum/);
  for (const t of [out.manual.wallet, out.manual.lookup]) assert.doesNotMatch(t, /\*\*Entity:\*\*[^\n]*\(mixer/);
});

test("named only in a court filing: a citation, no entity, no category, no risk wording", () => {
  for (const t of [out.court.wallet, out.court.lookup]) {
    assert.match(t, /\*\*Public record:\*\*/);
    assert.match(t, /citation, not a risk finding/);
    assert.doesNotMatch(t, /\*\*Labels:\*\*/);
    assert.doesNotMatch(t, /\*\*Category:\*\*/);
    assert.match(t, /\*\*Entity:\*\* Unknown \/ unlabeled/);
  }
  assert.match(out.court.lookup, /US District Court, District of Columbia · 1:25-cv-01907/);
  assert.match(out.court.lookup, /\*\*Risk Score:\*\* 0\/100/);
});

test("every printed score carries the estimate note", () => {
  for (const k of Object.keys(out)) for (const t of [out[k].wallet, out[k].lookup]) assert.ok(t.includes(NOTE), k);
});

test("no output states a taint category as a bare fact", () => {
  for (const k of Object.keys(out)) {
    for (const t of [out[k].wallet, out[k].lookup]) {
      assert.doesNotMatch(t, /\*\*Entity:\*\*[^\n]*\((hacker|scam|mixer|exploit)/i, k);
    }
  }
});

test("trace: an endpoint counts with what its label may act with, and says who attributed it", async () => {
  const incident = [{
    id: "i1", title: "Test hack", status: "traced", chain: "ethereum", attacker_address: "0xabc", attacker_address_source: "analyst_verified",
    amount_usd: 1000, estimated_loss_usd: 1000, risk_score: 80, incident_type: null, hack_date: "2026-01-01", display_date: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: null, source: "x", counterparty_exposure: null,
    flow_graph: { nodes: [{}, {}, {}], edges: [{ from: "0xabc", to: "0x1", amount_usd: 10 }] },
    endpoints: [
      { address: "0x1111111111111111", amount_usd: 500, entity_name: "Bybit Hack Exploiter", entity_category: "hacker", entity_source: "bybit_hackscan", label_trust: "attributed", attribution: { method: "hackscan_trace", source: "bybit_hackscan", publisher: "Bybit HackScan", note: "n" } },
      { address: "0x2222222222222222", amount_usd: 300, entity_name: "Unknown Exploiter", entity_category: "hacker", entity_source: "chainhint:manual", label_trust: "unverified" },
      { address: "0x3333333333333333", amount_usd: 200, entity_name: "Forta Attacker", entity_category: "hacker", entity_source: "forta", label_trust: "heuristic" },
    ],
  }];
  let text;
  await withServer(dist, async (call) => { text = await call("get_trace_status", { incident_id: "i1" }); }, { public_incidents_view: incident });
  assert.match(text, /\*\*attacker-attributed\*\*: .*1 attributed by Bybit HackScan, unverified — not scored/);
  assert.match(text, /\*\*unknown\*\*: .* — .*Unknown Exploiter — hacker, unverified \(ChainHint manual entry\)/);
  assert.match(text, /Detector alert \(Forta\), unverified/);
  assert.match(text, /0x111111\.\.\.111111|0x111111/);
  assert.match(text, /Bybit Hack Exploiter — attributed by Bybit HackScan, unverified \(attacker-attributed\)/);
  assert.doesNotMatch(text, /Unknown Exploiter[^\n]*\(attacker-attributed\)/);
});
