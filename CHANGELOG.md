# Changelog

## 1.4.4 — 2026-11-10

- **The risk level is printed in the words every other ChainHint surface uses.** The tools
  printed the API's level token in capitals, and the tokens cross the words: `low` is the band
  the address page, the Telegram bot and the PDF call "Moderate", while "Low Risk" is the
  token `clean`. One address read "30/100 · Moderate" in the bot and "30/100 — LOW" here. Both
  tools now print the API's `risk_label` (`risk_verdict.label` on `lookup_address`): Low Risk ·
  Moderate · Elevated · High Risk · Critical. The bounds did not move — 81 / 61 / 41 / 21.
- **The fallback ladder was the one the API left on 2026-11-01.** With no level in the response
  the server cut at 90 / 70 / 40 / 10, so a 12 printed as "LOW" where the API says `clean`.
  It is 81 / 61 / 41 / 21 now.
- **`check_wallet_risk` says why a floor set the score.** It prints the API's new
  `score_reasons` as a `Why:` line — for example "39% of outflow went to mixer users
  (Tornado Cash)". `lookup_address` already printed it under `Risk Details`.

## 1.4.3 — 2026-11-10

- **`lookup_address` printed no risk line at all when the API withheld the score.** The API
  answers `risk: null` when a screen that could have raised the score did not answer, and
  for an address that carries a label it still says `risk_status: "scored"`. The tool then
  returned the entity and the labels and nothing about risk — which an agent reads as
  "nothing wrong". It now prints `NOT SCORED` with the API's own sentence naming the screen
  (a sanctions list out of date, a GoPlus refusal, an unread counterparty exposure).
- **`check_wallet_risk` printed `null/100 — UNKNOWN`** for the same case, and said nothing
  about an incomplete screen or an exposure that was not read beside a score it did print.
  It prints `NOT SCORED` with the reason, and under a printed score: "Counterparty Exposure:
  not checked" and the incomplete-screen note when they apply.
- Both tools print the basis of a checked zero ("Checked N counterparties in recent
  transfers, none flagged. Older activity was not read.").
- `lookup_address` printed "EOA (wallet)" when the contract check had not answered
  (`is_contract: null`); it says "not determined".
- **The tool description still carried figures the site had withdrawn.** After the label
  withdrawals of 2026-11-08 the site's llms.txt counts fewer attributed and illicit-linked
  addresses; the README was updated then, `src/canon.ts` and its test were not, so `main`
  failed its own canon test and `canon:check` would have refused a publish. The canon now
  matches llms.txt again, and the two withdrawn figures joined the retired list.
- No tool or argument changed. The output text of the cases above did.

## 1.4.2 — 2026-11-03

- **The package named two sanctions lists ChainHint no longer screens.** `check_wallet_risk`
  and the README said "1,000+ sanctioned addresses across 5 authorities (OFAC, EU, AU, JP,
  FR)". On 2026-11-03 the site withdrew Australia DFAT and Japan MOF: no address it holds is
  designated by either, and the 14 rows credited to them were OFAC designations OpenSanctions
  had merged (main repo migration 289). The canon now says "from lists of 3 authorities
  (US OFAC, EU, France)" — the site's own wording in llms.txt.
- **`canon:check` now pins the authority count** against llms.txt, so a list the site stops
  screening fails the publish instead of staying in the package. "AU, JP" and "5 authorities"
  joined the retired-figure list.
- Versions before 1.4.0 still send ChainHint's legacy Supabase anon key in
  `get_trace_status`; ChainHint is retiring those keys, after which those versions answer 401
  there. Upgrade to 1.4.2. No tool, argument or output shape changed.

## Unreleased — 2026-10-11

- **Dependencies:** `npm audit` reported 10 advisories (1 critical, 4 high), 9
  of them in the tree under `@modelcontextprotocol/sdk` — mostly its HTTP
  transport (express, hono, proxy-addr), which this stdio server never starts.
  The lockfile now resolves SDK 1.32.1 and esbuild 0.28.2: 0 advisories,
  runtime and dev. No release needed for users: the package declares
  `@modelcontextprotocol/sdk ^1.0.0`, so every fresh install already resolves
  the patched versions; the lockfile only governs this repository's own builds.
- **`RELEASING.md`:** where and how to publish, step by step, with what went
  wrong on 1.4.1 and how each step prevents it.

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
