// Run: npm test (builds, then node --test). Imports the compiled module.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiErrorMessage, isTraceableChain, lookupRiskLines, traceStatusLine, tracingUnavailableMessage,
} from "../dist/verdicts.js";

test("lookup: risk_status unavailable never prints a score or CLEAN (the 1.3.1 Solana defect)", () => {
  const lines = lookupRiskLines({
    risk: { score: 0, level: "clean" },
    risk_status: "unavailable",
    data_availability: { transfers: "unavailable", provider: "helius", reason: "not_configured", detail: "Transfer data unavailable (Helius) — not a clean result" },
  });
  const text = lines.join("\n");
  assert.match(text, /DATA UNAVAILABLE/);
  assert.match(text, /not a clean result/);
  assert.doesNotMatch(text, /0\/100/);
  // The 1.3.1 line was "**Risk Score:** 0/100 — **CLEAN**".
  assert.doesNotMatch(text, /\*\*CLEAN\*\*|— CLEAN/);
  assert.equal(text.match(/not a clean result/gi)?.length, 1, "said once, even when the API detail already says it");
});

test("lookup: without an API detail the tool adds the not-clean sentence itself", () => {
  const text = lookupRiskLines({ risk_status: "unavailable", exposure: { data_unavailable: { provider: "trongrid" } } }).join("\n");
  assert.match(text, /transfer data \(trongrid\) could not be read\. This is not a clean result\./);
});

test("lookup: insufficient_data says NOT SCORED, not 0/100 — CLEAN", () => {
  const text = lookupRiskLines({ risk: { score: 0 }, risk_status: "insufficient_data" }).join("\n");
  assert.match(text, /NOT SCORED/);
  assert.doesNotMatch(text, /0\/100/);
});

test("lookup: a scored address keeps its score and factors", () => {
  const lines = lookupRiskLines({
    risk: { score: 85, level: "high", factors: { mixer_interaction: true, new_address: false }, details: ["Tornado Cash outflow"] },
    risk_status: "scored",
  });
  assert.deepEqual(lines, [
    "**Risk Score:** 85/100 — **HIGH**",
    "**Risk Factors:** mixer_interaction",
    "**Risk Details:** Tornado Cash outflow",
  ]);
});

test("lookup: scored from the DB but transfers unavailable says the exposure is missing", () => {
  const text = lookupRiskLines({
    risk: { score: 70, level: "high" },
    risk_status: "scored",
    exposure: { data_unavailable: { provider: "helius", reason: "not_configured" } },
  }).join("\n");
  assert.match(text, /70\/100/);
  assert.match(text, /Counterparty Exposure:\*\* not scored/);
});

test("lookup: old API without risk_status still prints the score", () => {
  assert.deepEqual(lookupRiskLines({ risk: { score: 12 } }), ["**Risk Score:** 12/100 — **LOW**"]);
});

test("trace: ✅ only when the stored trace holds transfers", () => {
  assert.match(traceStatusLine({ status: "traced", chain: "ethereum", attacker_address: "0xabc", edgeCount: 40 }), /^✅ Trace complete/);
  const empty = traceStatusLine({ status: "traced", chain: "solana", attacker_address: "9Wz", edgeCount: 0 });
  assert.doesNotMatch(empty, /✅|complete/i);
  assert.match(empty, /not evidence that the funds are dormant/);
});

test("trace: a chain ChainHint does not trace is a final answer, whatever the status", () => {
  for (const status of ["draft", "traced", null]) {
    const line = traceStatusLine({ status, chain: "Sui", attacker_address: null, edgeCount: 0 });
    assert.match(line, /^⚪ Tracing not available for Sui/);
    assert.match(line, /final/);
  }
  assert.match(traceStatusLine({ status: "draft", chain: "Unknown", attacker_address: null, edgeCount: 0 }), /chain is unknown/);
});

test("trace: no attacker address, analyzing, and other statuses", () => {
  assert.match(traceStatusLine({ status: "draft", chain: "bsc", attacker_address: null, edgeCount: 0 }), /no attacker address/);
  assert.equal(traceStatusLine({ status: "analyzing", chain: "base", attacker_address: "0x1", edgeCount: 0 }), "⏳ Trace in progress...");
  assert.equal(traceStatusLine({ status: "draft", chain: "base", attacker_address: "0x1", edgeCount: 0 }), "⚠️ Status: draft");
});

test("chains: mirror of the backend helper", () => {
  assert.equal(isTraceableChain("Solana"), true);
  assert.equal(isTraceableChain("Hyperliquid L1"), false);
  assert.equal(tracingUnavailableMessage("hyperliquid L1"), "Tracing not available for Hyperliquid L1");
});

test("errors: 422 is marked final, 503 is marked not-clean", () => {
  assert.match(apiErrorMessage(422, "Tracing not available for Sui", "u"), /final answer — not a temporary error/);
  assert.match(apiErrorMessage(503, "Transfer data unavailable", "u"), /not a clean result/);
  assert.equal(apiErrorMessage(400, undefined, "https://x"), "HTTP 400: https://x");
});

test("lookup: contract_not_verified is retired — never printed, even if an old response says true", () => {
  const lines = lookupRiskLines({
    risk: { score: 10, level: "low", factors: { contract_not_verified: true, new_address: true } },
    risk_status: "scored",
  });
  assert.deepEqual(lines, ["**Risk Score:** 10/100 — **LOW**", "**Risk Factors:** new_address"]);
  assert.doesNotMatch(lookupRiskLines({ risk: { score: 0, factors: { contract_not_verified: true } } }).join("\n"), /contract_not_verified|Risk Factors/);
});

test("lookup: the USDT contract (own-token-contract freeze, scored 0) is not a HIGH or freeze verdict", () => {
  // Shape of address-lookup for the USDT contract after 2026-09-15.
  const text = lookupRiskLines({
    risk: { score: 0, level: "clean", factors: { issuer_freeze: false, contract_not_verified: false }, details: ["Tether blacklisted tokens held by this contract"] },
    risk_status: "scored",
  }).join("\n");
  assert.match(text, /Tether blacklisted tokens held by this contract/);
  assert.doesNotMatch(text, /HIGH|issuer_freeze|Frozen by issuer/);
});
