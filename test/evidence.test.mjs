// Pins the evidence wording to the main repo's _shared/evidence-labels.ts (migration 129).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLines, evidenceText } from "../dist/evidence.js";

test("sanctions designation is the only class printed as Sanctioned", () => {
  assert.equal(
    evidenceText({ class: "sanctions_designation", authority: "US OFAC", subject: "GARANTEX EUROPE OU", document_ref: null, legal_basis: null, document_date: null }),
    "⛔ Sanctioned — US OFAC · GARANTEX EUROPE OU",
  );
});

test("issuer freeze names issuer, token, chain and says it is not a designation", () => {
  assert.equal(
    evidenceText({ class: "issuer_freeze", authority: "Tether", token: "USDT", chain: "tron", document_date: null, first_seen_at: "2026-03-19T21:58:05Z" }),
    "🧊 Frozen by issuer — Tether (USDT, TRON) · first seen by ChainHint 2026-03-19. Not a sanctions designation.",
  );
});

test("law-enforcement attribution", () => {
  assert.equal(
    evidenceText({ class: "law_enforcement_attribution", authority: "US FBI", document_ref: "IC3 PSA 250226", document_date: "2025-02-26", subject: "Lazarus Group (DPRK)" }),
    "🚩 Law-enforcement attribution — US FBI, IC3 PSA 250226 (2025-02-26): Lazarus Group (DPRK). Not a sanctions designation.",
  );
});

test("national seizure order", () => {
  assert.equal(
    evidenceText({ class: "national_seizure_order", authority: "Israel NBCTF", document_ref: null, subject: null }),
    "🏛️ National seizure order — Israel NBCTF. Not a sanctions designation.",
  );
});

test("evidenceLines orders designations first and drops unknown classes", () => {
  const lines = evidenceLines([
    { class: "issuer_freeze", authority: "Tether", token: "USDT", chain: "tron", document_date: "2025-06-01" },
    { class: "made_up", authority: "x" },
    { class: "sanctions_designation", authority: "US OFAC", subject: "Grinex" },
  ]);
  assert.deepEqual(lines, [
    "- ⛔ Sanctioned — US OFAC · Grinex",
    "- 🧊 Frozen by issuer — Tether (USDT, TRON) · 2025-06-01. Not a sanctions designation.",
  ]);
  assert.deepEqual(evidenceLines(null), []);
});
