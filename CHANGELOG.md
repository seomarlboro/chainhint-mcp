# Changelog

## 1.3.4 — 2026-09-15

- **Database figures:** the tool description and README now state ChainHint's current canon — 45M+ attributed addresses across 12 chains, including 485K+ addresses linked to illicit activity and 1,000+ sanctioned addresses across 5 authorities (OFAC, EU, AU, JP, FR). The retired address and entity counts are gone.
- **Own-token-contract freeze:** an `issuer_freeze` evidence item with `held_by_token_contract: true` (the issuer blacklisted the tokens held by its own contract, e.g. the USDT contract) prints the API's wording — *Tether blacklisted tokens held by this contract* — instead of "Frozen by issuer". The API scores it 0.
- **Retired risk factor:** `contract_not_verified` is no longer scored by the API; `lookup_address` never prints it, even from an older response.
- **Unconfirmed attributions / closed venues:** when the API's entity block carries `attribution_unconfirmed: true` the entity is printed as a candidate with an *Attribution unconfirmed* marker (never "verified"); `operating_status` `closed` / `bankrupt` adds *Venue closed* / *Bankrupt*. Both fields are optional — responses without them print as before.
- **TON input:** tool parameter descriptions list every accepted address form; TON friendly (`EQ`/`UQ`/`Ef`/`Uf`) and raw (`0:`/`-1:` hex) addresses are passed to the API as typed (never lower-cased). Only a 0x + 40-hex EVM address is lower-cased now.

## 1.3.3 — 2026-09-14

- Evidence classes: "Sanctioned" only for a sanctions designation; freezes, attributions, seizure orders and blocklists say *Not a sanctions designation.*

## 1.3.2 — 2026-09-14

- A missing input is never reported as CLEAN, 0/100 or "Trace complete".

## 1.3.1 — 2026-09-14

- No HIGH risk for unverified attacker addresses ("Reported attacker, unverified").
