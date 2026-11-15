// The one print path (port of the main product's printedLabel, 2026-11-15). Pins the strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printedLabel, graphItemTrust, bucketCategory, sourceLabel } from "../dist/label-print.js";
import { entityLine, labelLines, publicRecordLines, attributionNoteLine } from "../dist/entity.js";

test("an unverified taint label is a claim with whose it is", () => {
  const p = printedLabel({ entity_name: "Tornado Cash", entity_category: "mixer", entity_source: "chainhint:manual" });
  assert.equal(p.text, "Tornado Cash — mixer, unverified (ChainHint manual entry)");
  assert.equal(p.trust, "unverified");
  assert.equal(printedLabel({ entity_name: "x", entity_category: "hacker" }).text, "x — hacker, unverified");
});

test("sanctioned category without a designation is not a sanctions finding", () => {
  assert.equal(printedLabel({ entity_name: "Foo", entity_category: "sanctioned", entity_source: "flipside" }).text, "Foo — unverified label — no sanctions designation on file");
  // with the designation the category stands, unmarked
  const v = printedLabel({ entity_name: "Foo", entity_category: "sanctioned", evidence_classes: ["sanctions_designation"] });
  assert.equal(v.text, "Foo");
  assert.equal(v.trust, "verified");
});

test("an issuer freeze verifies the freeze, never a hacker label", () => {
  const p = printedLabel({ entity_name: "X", entity_category: "hacker", evidence_classes: ["issuer_freeze"] });
  assert.notEqual(p.trust, "verified");
  assert.match(p.text, /hacker, unverified/);
});

test("attributed and confirmed sources", () => {
  const att = { method: "hackscan_trace", source: "bybit_hackscan", publisher: "Bybit HackScan" };
  assert.equal(printedLabel({ entity_name: "Bybit Hack Exploiter", entity_category: "hacker", label_trust: "attributed", attribution: att }).text,
    "Bybit Hack Exploiter — attributed by Bybit HackScan, unverified");
  const conf = { method: "public_label_registry", source: "tornado-cash-contracts", publisher: "Tornado Cash's own contract list" };
  assert.equal(printedLabel({ entity_name: "Tornado Cash", entity_category: "mixer", label_trust: "attributed", attribution: conf }).text,
    "Tornado Cash — on Tornado Cash's own contract list");
  // a stamp without an attribution, or on a service category, does not attribute
  assert.equal(graphItemTrust({ entity_name: "a", entity_category: "hacker", label_trust: "attributed" }), "unverified");
  assert.equal(graphItemTrust({ entity_name: "a", entity_category: "exchange", label_trust: "attributed", attribution: att }), "unverified");
});

test("a detector's flag and a fan-in guess are named as what they are", () => {
  assert.equal(printedLabel({ entity_name: "Forta Attacker", entity_category: "hacker", entity_source: "forta" }).text, "Detector alert (Forta), unverified");
  assert.equal(printedLabel({ entity_name: "Bybit deposit", entity_category: "exchange", attributed_via: "outbound_flow" }).text,
    "Likely Bybit deposit (sweeps to a known Bybit wallet) — inferred, not identified");
});

test("what an item is COUNTED with: unverified taint is unknown, attributed keeps its category", () => {
  assert.equal(bucketCategory({ entity_name: "a", entity_category: "hacker" }), "unknown");
  assert.equal(bucketCategory({ entity_name: "a", entity_category: "hacker", evidence_classes: ["analyst_verified"] }), "hacker");
  assert.equal(bucketCategory({ entity_name: "a", entity_category: "hacker", label_trust: "attributed", attribution: { publisher: "P" } }), "hacker");
  assert.equal(sourceLabel("chainhint:manual"), "ChainHint manual entry");
});

test("entityLine: attributed, confirmed, manual, unconfirmed", () => {
  assert.equal(
    entityLine({ name: "Bybit Hack Exploiter", category: "hacker", source: "bybit_hackscan", attribution_method: "hackscan_trace", confidence: 0.5 }),
    "**Entity:** Bybit Hack Exploiter — attributed by Bybit HackScan, unverified",
  );
  assert.equal(
    entityLine({ name: "Tornado Cash", category: "mixer", source: "tornado-cash-contracts", attribution_method: "public_label_registry" }),
    "**Entity:** Tornado Cash — on Tornado Cash's own contract list",
  );
  assert.equal(
    entityLine({ name: "Tornado Cash", category: "mixer", source: "chainhint:manual", attribution_method: null }, { attributedOnNote: "attributed on Arbitrum" }),
    "**Entity:** Tornado Cash — mixer, unverified (ChainHint manual entry) — attributed on Arbitrum",
  );
  assert.match(entityLine({ name: "c", category: "bridge", attribution_unconfirmed: true }), /candidate: bridge.*Attribution unconfirmed/);
  assert.equal(attributionNoteLine({ name: "T", attribution: { method: "public_label_registry", publisher: "Tornado Cash's own contract list", note: "x" } }), null);
});

test("labels: the entity's own name is not repeated bare; a court-filing label is a citation", () => {
  assert.deepEqual(labelLines({ labels: ["Bybit Hack Exploiter"], entityName: "Bybit Hack Exploiter" }), []);
  const l = labelLines({ labels: ["Named in US court filing"] });
  assert.equal(l.length, 1);
  assert.match(l[0], /^\*\*Public record:\*\* Named in a US court filing — a citation, not a risk finding/);
  assert.doesNotMatch(l.join("\n"), /Labels/);
  const rec = publicRecordLines([{ authority: "US DOJ", document_label: "DOJ press release, 2025-06-18", document_date: "2025-06-18", caveat: "Named in a public court filing. No role is asserted." }]);
  assert.equal(rec[1], "- US DOJ · DOJ press release, 2025-06-18");
});
