/**
 * Public database figures — the ChainHint canon (owner decision 2026-09-15,
 * main repo migration 143, public/llms.txt). test/canon.test.mjs pins it and
 * forbids the retired address / entity counts in the source and the README.
 *
 * THE SITE IS THE SOURCE. "Change only together with the site" was the rule and
 * it was prose, so by 2026-10-05 this file had fallen three weeks behind
 * https://chainhint.com/llms.txt on two of the three figures — the site's are
 * generated from a database snapshot (`showcase:sync` -> `llms:sync`) and move
 * on their own, these do not. One of the stale ones was a figure the site had
 * itself retired. The numbers are in CHANGELOG.md, not here: the retired-figure
 * gate scans this file, and it is right to.
 *
 * `npm run canon:check` now fetches llms.txt and fails when they disagree, so
 * the rule has teeth instead of a sentence. It runs on `prepublishOnly`.
 */

export const ATTRIBUTED_ADDRESSES = "48M+";
export const ILLICIT_ADDRESSES = "486K+";
export const SANCTIONED_ADDRESSES = "1,000+";
export const SANCTIONS_AUTHORITIES = "OFAC, EU, AU, JP, FR";

/** "48M+ attributed addresses across 12 chains, including 486K+ …" */
export const DATABASE_CANON =
  `${ATTRIBUTED_ADDRESSES} attributed addresses across 12 chains, including ${ILLICIT_ADDRESSES} addresses linked to illicit activity and ${SANCTIONED_ADDRESSES} sanctioned addresses across 5 authorities (${SANCTIONS_AUTHORITIES})`;
