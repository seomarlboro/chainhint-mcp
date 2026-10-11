# Changelog

## 1.4.1 — 2026-10-11

- **The canon had fallen behind the site, and the rule that was supposed to stop
  that was prose.** `src/canon.ts` said `45M+` attributed and `485K+`
  illicit-linked; `https://chainhint.com/llms.txt` had said `48M+` and `486K+`
  since 2026-09-18 — the site generates those from a database snapshot
  (`showcase:sync` -> `llms:sync`) and they move on their own. `485K+` was a
  figure the site had itself retired three weeks earlier. The tool descriptions
  this package publishes carried both.
- **`npm run canon:check`** fetches `llms.txt` and fails when a canon figure is
  not on the site; it runs on `prepublishOnly`, so a stale figure cannot be
  published again. An unreachable site exits 2 and reports "could not check" —
  never a pass.
- `45M+` and `485K+` joined the retired-figure list in `test/canon.test.mjs`, so
  neither can come back.
- **2026-10-11, before merging:** `canon:check` — the check this release adds —
  failed on its own branch. The site's illicit-linked figure had FALLEN from
  `486K+` to `483K+` on 2026-10-09 (corrections removed labels; the count is not
  monotonic). The canon now says `483K+`, and `486K+` joined the retired list.
  The mechanism caught exactly the drift it was written for, six days after it
  was written.
- Nothing else changed: no tool, no argument, no output shape. The free tier is
  still 3 wallet checks and 10 lookups per IP per day.

## 1.4.0 — 2026-09-15

- **Supabase publishable key (KIR-81):** `get_trace_status` reads public incidents with the project's publishable key, sent **only** in the `apikey` header — never as `Authorization: Bearer`. New override `CHAINHINT_SUPABASE_PUBLISHABLE_KEY`; the old `CHAINHINT_SUPABASE_ANON_KEY` is still honoured.
- **Upgrade required:** versions before 1.4.0 send the legacy anon JWT and will get 401 once ChainHint disables its legacy Supabase API keys. `check_wallet_risk` and `lookup_address` never sent that key and are unaffected.
- No JWT ships in the package any more; `npm publish` is refused (prepublishOnly) unless the built-in default is a real `sb_publishable_` key.

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
