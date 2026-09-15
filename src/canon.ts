/**
 * Public database figures — the ChainHint canon (owner decision 2026-09-15,
 * main repo migration 143, public/llms.txt). test/canon.test.mjs pins it and
 * forbids the retired address / entity counts in the source and the README.
 * Change only together with the site.
 */

export const ATTRIBUTED_ADDRESSES = "45M+";
export const ILLICIT_ADDRESSES = "485K+";
export const SANCTIONED_ADDRESSES = "1,000+";
export const SANCTIONS_AUTHORITIES = "OFAC, EU, AU, JP, FR";

/** "45M+ attributed addresses across 12 chains, including 485K+ …" */
export const DATABASE_CANON =
  `${ATTRIBUTED_ADDRESSES} attributed addresses across 12 chains, including ${ILLICIT_ADDRESSES} addresses linked to illicit activity and ${SANCTIONED_ADDRESSES} sanctioned addresses across 5 authorities (${SANCTIONS_AUTHORITIES})`;
