#!/usr/bin/env node
/**
 * Does the canon still match the site?
 *
 * `src/canon.ts` carries the public database figures and its header has always
 * said "change only together with the site". That was prose. On 2026-10-05 this
 * package said 45M+ / 485K+ while https://chainhint.com/llms.txt said 48M+ /
 * 486K+ — the site's numbers are generated from a database snapshot and move on
 * their own, these do not. 485K+ was a figure the site had itself retired on
 * 2026-09-18, three weeks earlier.
 *
 * So the rule gets a mechanism. This fetches llms.txt — the same file the main
 * repo generates with `npm run llms:sync` — and fails when a canon figure is not
 * in it. It is NOT part of `npm test`, because a unit test must not depend on
 * the network; it runs before a publish and whenever somebody wants to know.
 *
 *   npm run canon:check
 *
 * A network failure is reported as "could not check", never as a pass: an
 * unreachable site is not agreement.
 */
import { ATTRIBUTED_ADDRESSES, ILLICIT_ADDRESSES, SANCTIONED_ADDRESSES } from "../dist/canon.js";

const URL_ = process.env.CHAINHINT_LLMS_URL ?? "https://chainhint.com/llms.txt";
const TIMEOUT_MS = 20_000;

const figures = [
  ["attributed addresses", `${ATTRIBUTED_ADDRESSES} attributed addresses`],
  ["illicit-linked addresses", `${ILLICIT_ADDRESSES} addresses linked to illicit activity`],
  ["sanctioned addresses", `${SANCTIONED_ADDRESSES} addresses carry an active sanctions designation`],
];

let text;
try {
  const res = await fetch(URL_, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  text = await res.text();
} catch (err) {
  console.error(`canon:check COULD NOT CHECK — ${URL_}: ${err.message}`);
  console.error("  An unreachable site is not agreement. Try again before publishing.");
  process.exit(2);
}

const missing = figures.filter(([, needle]) => !text.includes(needle));
for (const [what, needle] of figures) {
  console.log(`${missing.some(([w]) => w === what) ? "✗" : "✓"} ${what.padEnd(26)} "${needle}"`);
}

if (missing.length > 0) {
  console.error(`\ncanon:check FAILED — ${missing.length} figure(s) are not on the site.`);
  console.error(`  ${URL_} is the source. Update src/canon.ts, the README and the`);
  console.error("  pinned sentence in test/canon.test.mjs together, and add the retired");
  console.error("  figure to RETIRED so it cannot come back.");
  process.exit(1);
}
console.log(`\ncanon:check ok — all ${figures.length} figures are on the site.`);
