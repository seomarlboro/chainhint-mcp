// Run: npm test (builds, then node --test). Imports the compiled module.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addressTypeLine, apiErrorMessage, isTraceableChain, lookupRiskLines, reputationRiskLines, riskLabel, traceStatusLine, tracingUnavailableMessage,
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
  // The 1.3.1 line was "**Risk Score:** 0/100 — **Low Risk**".
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
    "**Risk Score:** 85/100 — **Critical**",
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
  assert.deepEqual(lookupRiskLines({ risk: { score: 12 } }), ["**Risk Score:** 12/100 — **Low Risk**"]);
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
  assert.deepEqual(lines, ["**Risk Score:** 10/100 — **Low Risk**", "**Risk Factors:** new_address"]);
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

// ── 1.4.3: a withheld score is said, never skipped ──────────────────────────

const SANCTIONS_NOTE = "Screen incomplete — sanctions screen could not be read (sanctions list OFAC SDN is out of date (last update 2026-11-08 05:30 UTC)). Absence of data is not a clean verdict.";

test("lookup: risk null beside risk_status scored prints NOT SCORED — it used to print nothing", () => {
  // A labelled address whose screen did not answer: the API withholds `risk` and still says "scored".
  const lines = lookupRiskLines({
    risk: null, risk_status: "scored",
    risk_verdict: { score: null, level: "unknown", screen_status: { complete: false, incomplete: ["sanctions"], note: SANCTIONS_NOTE } },
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /NOT SCORED/);
  assert.match(lines[0], /sanctions list OFAC SDN is out of date/);
  assert.equal(lines[0].match(/not a clean (result|verdict)/gi)?.length, 1, "the not-clean sentence is said once");
  assert.doesNotMatch(lines[0], /\/100|CLEAN\*\*/);
});

test("lookup: risk null with no note still prints a line, never silence", () => {
  const lines = lookupRiskLines({ risk: null, risk_status: "scored" });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /NOT SCORED — the score was withheld/);
  assert.match(lines[0], /This is not a clean result\./);
});

test("lookup: unavailable names the screen that failed, not transfer data", () => {
  const note = "Screen incomplete — address security flags could not be read (GoPlus rate limit (4029)). Absence of data is not a clean verdict.";
  const text = lookupRiskLines({ risk: null, risk_status: "unavailable", risk_verdict: { score: null, screen_status: { complete: false, note } } }).join("\n");
  assert.match(text, /GoPlus rate limit \(4029\)/);
  assert.doesNotMatch(text, /transfer data/);
});

test("lookup: a checked zero prints what it rests on", () => {
  const basis = "Checked 6 counterparties in recent transfers, none flagged. Older activity was not read.";
  const lines = lookupRiskLines({ risk: { score: 0, level: "clean" }, risk_status: "scored", score_basis: basis });
  assert.deepEqual(lines, ["**Risk Score:** 0/100 — **Low Risk**", `**Basis:** ${basis}`]);
});

test("address type: null is not an EOA", () => {
  assert.equal(addressTypeLine(true), "**Type:** Smart Contract");
  assert.equal(addressTypeLine(false), "**Type:** EOA (wallet)");
  assert.match(addressTypeLine(null), /not determined/);
  assert.match(addressTypeLine(undefined), /not determined/);
});

test("check_wallet_risk: a withheld score never prints null/100", () => {
  const lines = reputationRiskLines({
    risk_score: null, risk_level: "unknown", risk_status: "unavailable",
    screen_status: { complete: false, incomplete: ["counterparty_exposure"], note: "Screen incomplete — counterparty exposure could not be read (outbound counterparties were not read for this verdict). Absence of data is not a clean verdict." },
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /NOT SCORED — Screen incomplete — counterparty exposure could not be read/);
  assert.doesNotMatch(lines[0], /null\/100|UNKNOWN\*\*/);
});

test("check_wallet_risk: no data uses the API's own note", () => {
  const lines = reputationRiskLines({ risk_score: null, risk_level: "unknown", risk_status: "insufficient_data", risk_score_note: "Not scored: no data for this address." });
  assert.match(lines[0], /NOT SCORED — Not scored: no data for this address\. This is not a clean result\./);
});

test("check_wallet_risk: a printed score says what it does not include", () => {
  const lines = reputationRiskLines({
    risk_score: 45, risk_level: "medium", exposure_checked: false,
    screen_status: { complete: false, note: SANCTIONS_NOTE }, sanctions: { hit: null, complete: false },
  });
  assert.equal(lines[0], "**Risk Score:** 45/100 — **Elevated**");
  assert.match(lines[1], /Counterparty Exposure:\*\* not checked/);
  assert.match(lines[2], /sanctions list OFAC SDN is out of date/);
});

test("check_wallet_risk: a complete, checked answer is the score, its basis and nothing else", () => {
  const basis = "Checked 3 counterparties in recent transfers, none flagged. Older activity was not read.";
  assert.deepEqual(
    reputationRiskLines({ risk_score: 0, risk_level: "clean", exposure_checked: true, score_basis: basis, screen_status: { complete: true, incomplete: [], note: null }, sanctions: { hit: false, complete: true } }),
    ["**Risk Score:** 0/100 — **Low Risk**", `**Basis:** ${basis}`],
  );
});

test("1.4.4: the level is the words every other surface prints, not the API's token", () => {
  // The bot said "30/100 · Moderate" and this server said "30/100 — LOW" for one address.
  assert.equal(reputationRiskLines({ risk_score: 30, risk_level: "low", risk_label: "Moderate" })[0], "**Risk Score:** 30/100 — **Moderate**");
  // An API without risk_label: the same ladder, 81 / 61 / 41 / 21 — never the token.
  assert.equal(reputationRiskLines({ risk_score: 30, risk_level: "low" })[0], "**Risk Score:** 30/100 — **Moderate**");
  assert.deepEqual([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(riskLabel),
    ["Low Risk", "Low Risk", "Moderate", "Moderate", "Elevated", "Elevated", "High Risk", "High Risk", "Critical", "Critical"]);
  assert.equal(lookupRiskLines({ risk: { score: 30, level: "low" }, risk_verdict: { score: 30, level: "low", label: "Moderate" } })[0], "**Risk Score:** 30/100 — **Moderate**");
});

test("1.4.4: check_wallet_risk prints why a floor set the score", () => {
  const lines = reputationRiskLines({ risk_score: 30, risk_level: "low", risk_label: "Moderate", score_reasons: ["39% of outflow went to mixer users (Tornado Cash)"], exposure_checked: true });
  assert.deepEqual(lines, ["**Risk Score:** 30/100 — **Moderate**", "**Why:** 39% of outflow went to mixer users (Tornado Cash)"]);
  assert.equal(reputationRiskLines({ risk_score: 30, score_reasons: [] }).length, 1);
});
