/**
 * Address input handling — pure functions, tested in test/address.test.mjs.
 *
 * The MCP does not validate addresses: the ChainHint API does (400 with a
 * format hint) and resolves every spelling of an address to its stored form
 * (main repo: backend/supabase/functions/_shared/address-canon.ts). The tools
 * only trim and lower-case EVM hex. Anything else is passed exactly as typed:
 * base58 chains (BTC/TRON/SOL) are case-sensitive, and TON friendly addresses
 * (EQ…/UQ…/Ef…/Uf…) carry a checksum over their case.
 */

/** EVM → lower case; every other chain's address is kept as typed (trimmed). */
export function normalizeAddr(addr: string): string {
  const a = addr.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a;
}

/**
 * Shape of a TON address, no checksum: "raw" (0:/-1: + 64 hex), "friendly"
 * (48-char mainnet EQ/UQ/Ef/Uf), "testnet" (kQ/0Q/kf/0f — ChainHint does not
 * cover testnet), or null. Informational only; the API decides validity.
 */
export function tonAddressForm(addr: string): "raw" | "friendly" | "testnet" | null {
  const a = addr.trim();
  if (/^(0|-1):[0-9a-fA-F]{64}$/.test(a)) return "raw";
  if (!/^[A-Za-z0-9_+/-]{48}$/.test(a)) return null;
  if (/^(EQ|UQ|Ef|Uf)/.test(a)) return "friendly";
  if (/^(kQ|0Q|kf|0f)/.test(a)) return "testnet";
  return null;
}

/** Tool parameter text: which address spellings the tools accept. */
export const ADDRESS_FORMS =
  "EVM 0x…, Bitcoin (1…/3…/bc1…), Solana, TRON (T…), or TON — mainnet friendly EQ…/UQ…/Ef…/Uf… or raw 0:<hex>/-1:<hex>, any form finds the same address (testnet kQ…/0Q… is not covered)";
