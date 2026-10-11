# Releasing chainhint-mcp

Written 2026-10-11, after a release that took six attempts. Every step below is
here because skipping it went wrong once.

## Before you publish

The version bump and its CHANGELOG entry go through a pull request into `main`,
like any other change. Publish only what is on `main`.

## Publishing — on your Mac, in a fresh clone

1. Open a **new** terminal. Do not use a tab that is already inside another
   project: `npm publish` publishes whatever folder it runs in.

2. Clone into a folder used only for this:
   ```bash
   cd ~ && rm -rf chainhint-mcp-publish && gh repo clone seomarlboro/chainhint-mcp chainhint-mcp-publish && cd chainhint-mcp-publish
   ```

3. Check you are where you think you are. This must print
   `chainhint-mcp@<the version you are releasing>`:
   ```bash
   node -p 'require("./package.json").name + "@" + require("./package.json").version'
   ```

4. Install exactly what the lockfile says:
   ```bash
   npm ci
   ```

5. Publish — **with no `--otp` flag**:
   ```bash
   npm publish
   ```
   - `prepublishOnly` builds, checks that the default Supabase key is a
     publishable one, and compares every database figure in `src/canon.ts` with
     `https://chainhint.com/llms.txt`. If any of them fail, nothing is published.
   - npm then prints `Authenticate your account at: https://www.npmjs.com/auth/cli/…`
     and `Press ENTER to open in the browser`. Press Enter and confirm in the
     browser. That is the whole of two-factor here.
   - It ends with `+ chainhint-mcp@<version>`. The registry can take a few
     minutes to show it.

6. Tag the release and clean up:
   ```bash
   git tag v<version> && git push origin v<version> && cd ~ && rm -rf ~/chainhint-mcp-publish
   ```

## What went wrong before, so it does not again

- **`npm publish` in the wrong folder.** A terminal tab opened inside the
  ChainHint site repository ran it there. That repository is `"private": true`,
  so npm refuses a real publish (`EPRIVATE`), but check step 3 anyway.
- **`--otp=123456`.** Passing `--otp` replaces the browser confirmation with a
  code prompt, and a wrong or example code makes npm ask again in a loop. Use
  plain `npm publish`.
- **`E401` / `E404` on publish.** The saved npm login has expired. Run
  `npm login` (it also confirms in the browser), then publish.
- **An automated shell cannot publish.** Without a terminal and a browser, npm
  answers `EOTP`. A person runs step 5.
