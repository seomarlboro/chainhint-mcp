// TON friendly / raw input is accepted and passed through as typed; EVM hex is lower-cased.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDRESS_FORMS, normalizeAddr, tonAddressForm } from "../dist/address.js";

// One account in every mainnet spelling (main repo: _shared/address-canon.test.ts).
const RAW = "0:bbae71c7b4c5412b28621a701bb58225cc6c52d1d7e2dd96c7131157d0b622f5";
const EQ = "EQC7rnHHtMVBKyhiGnAbtYIlzGxS0dfi3ZbHExFX0LYi9cAH";
const UQ = "UQC7rnHHtMVBKyhiGnAbtYIlzGxS0dfi3ZbHExFX0LYi9Z3C";
const EF = "Ef_dJMSh8riPi3BTUTtcxsWjG8RLKnLctNjAM4rw8NN-xWdr";
const UF = "Uf_dJMSh8riPi3BTUTtcxsWjG8RLKnLctNjAM4rw8NN-xTqu";

test("TON friendly and raw forms are recognised and never altered", () => {
  for (const a of [EQ, UQ, EF, UF]) {
    assert.equal(tonAddressForm(a), "friendly", a);
    assert.equal(normalizeAddr(` ${a} `), a);
  }
  assert.equal(tonAddressForm(RAW), "raw");
  assert.equal(tonAddressForm("-1:" + "A".repeat(64)), "raw");
  assert.equal(normalizeAddr(RAW.toUpperCase().replace("0:", "0:")), RAW.toUpperCase(), "raw hex case is left to the API");
});

test("TON testnet is identified as such", () => {
  assert.equal(tonAddressForm("kQC7rnHHtMVBKyhiGnAbtYIlzGxS0dfi3ZbHExFX0LYi9cAH"), "testnet");
  assert.equal(tonAddressForm("0QC7rnHHtMVBKyhiGnAbtYIlzGxS0dfi3ZbHExFX0LYi9cAH"), "testnet");
  assert.equal(tonAddressForm("0x47666fab8bd0ac7003bce3f5c3585383f09486e2"), null);
});

test("only EVM hex is lower-cased; base58 keeps its case", () => {
  assert.equal(normalizeAddr("0x47666FAB8bd0ac7003bce3f5c3585383f09486e2"), "0x47666fab8bd0ac7003bce3f5c3585383f09486e2");
  assert.equal(normalizeAddr("TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL"), "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL");
});

test("tool parameter text lists the TON forms", () => {
  for (const s of ["EQ…", "UQ…", "Ef…", "Uf…", "0:<hex>", "kQ…"]) assert.ok(ADDRESS_FORMS.includes(s), s);
});
