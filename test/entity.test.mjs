// Migration-144 entity fields (attribution_unconfirmed, operating_status) — optional.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entityLine, entityMarkers } from "../dist/entity.js";

test("without the new fields the line is exactly the 1.3.3 wording", () => {
  assert.equal(
    entityLine({ name: "Binance", category: "exchange", subcategory: "hot_wallet", verified: true }, { showVerified: true }),
    "**Entity:** Binance (exchange / hot_wallet, verified)",
  );
  assert.equal(
    entityLine({ name: "Tornado Cash", category: "mixer", subcategory: null, confidence: 0.9 }),
    "**Entity:** Tornado Cash (mixer, confidence 90%)",
  );
  assert.deepEqual(entityMarkers({ name: "x", attribution_unconfirmed: false, operating_status: null }), []);
});

test("unconfirmed attribution is a candidate, never verified", () => {
  const line = entityLine(
    { name: "coinbase", category: "bridge", subcategory: "deposit_commerce", verified: true, confidence: 0.8, attribution_unconfirmed: true },
    { showVerified: true },
  );
  assert.match(line, /^\*\*Entity:\*\* coinbase \(candidate: bridge \/ deposit_commerce\) — ⚠️ Attribution unconfirmed/);
  assert.match(line, /not a finding/);
  assert.doesNotMatch(line, /verified\)|confidence/);
});

test("closed and bankrupt venues are marked; unknown statuses ignored", () => {
  assert.match(entityLine({ name: "FTX", category: "exchange", operating_status: "bankrupt" }), /— Bankrupt — address the estate \/ trustee\.$/);
  assert.match(entityLine({ name: "Bitzlato", category: "exchange", operating_status: "CLOSED" }), /— Venue closed/);
  assert.equal(entityLine({ name: "Kraken", category: "exchange", operating_status: "paused" }), "**Entity:** Kraken (exchange)");
});
