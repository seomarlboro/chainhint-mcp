// Pins the public database figures (owner decision 2026-09-15) and the release version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DATABASE_CANON } from "../dist/canon.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const RETIRED = [/54(\.9)?M/i, /3\.9M/i, /labeled address/i, /known entities/i, /OFAC, EU, UK, UN/];

test("canon sentence is the site's", () => {
  assert.equal(
    DATABASE_CANON,
    "45M+ attributed addresses across 12 chains, including 485K+ addresses linked to illicit activity and 1,000+ sanctioned addresses across 5 authorities (OFAC, EU, AU, JP, FR)",
  );
});

test("check_wallet_risk description carries the canon (compiled server)", () => {
  const js = read("dist/index.js");
  assert.match(js, /Fast risk check for a crypto wallet address against ChainHint's entity database — \$\{DATABASE_CANON\}/);
});

test("no retired figure in src, README or package.json", () => {
  const files = [
    ...readdirSync(new URL("src/", root)).map((f) => `src/${f}`),
    "README.md",
    "package.json",
  ];
  for (const f of files) {
    const text = read(f);
    for (const re of RETIRED) assert.doesNotMatch(text, re, `${f} still says ${re}`);
  }
  const readme = read("README.md");
  for (const s of ["45M+ attributed addresses", "485K+", "1,000+ sanctioned addresses", "OFAC, EU, AU, JP, FR"]) {
    assert.ok(readme.includes(s), `README misses ${s}`);
  }
});

test("server version = package.json version = CHANGELOG head", () => {
  const { version } = JSON.parse(read("package.json"));
  assert.match(read("src/index.ts"), new RegExp(`const VERSION = "${version.replace(/\./g, "\\.")}";`));
  assert.equal(JSON.parse(read("package-lock.json")).version, version);
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${version.replace(/\./g, "\\.")} `, "m"));
});
