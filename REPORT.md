# Surety — final report

**1. What it is.** One contract, `contracts/surety.py` (45,497 bytes), that pins one public promise to
one https URL, requires validators to prove the promise is physically present before activation, and
lets anyone trigger a re-check under the owner's own rule. It is a commitment-and-verification
protocol: not escrow, not arbitration, not a court. No transfer, withdraw, claim or payout method
exists, and a breach changes a status and pays nobody.

**2. Live deployment.** Studionet, contract `0x45BCF7584F706835562C37Fd821C08748667Ce5f`.
`gen_getContractCode` (base64) decodes to sha256 `65fed909…caf0a6eb`, byte for byte the repository's
file (`scripts/verify_code.py` → `identical: yes`). Counters re-read today: `{covenants: 2, checks: 1,
breaches: 1, activation_refusals: 1}`.

**3. Proven by live transactions.** Activation of a promise really in the source (anchor quote "We
never sell or share subscriber email addresses with third parties.", digest `67117881…`); a later
check returned `MAJORITY_AGREE` / verdict `BREACH`, `quote_present true`, `rule_span ""` (a literal
rule cites none) and page digest `2eb80ce4…` equal to an independent `scripts/page_digest.py` fetch; a
fabricated promise never in the source → `REFUSED_PROMISE_ABSENT`, `is_active false`, no anchor; a
check on the breached covenant → `FINALIZED`, `[EXPECTED] covenant is not active`, no state change.

**4. Tests and lint.** 97 passed, 0 skips (direct mode), plus 20 web tests (node's built-in
runner) and 0 skips there. `genvm-lint check`: 3 checks + validation +
10 methods (7 view, 3 write) via the supported `GENVMROOT` path; a bare run passes lint and then fails
SDK validation with `HTTP Error 404` on `genvm-universal.tar.xz`, because the linter resolves the
newest runner tag instead of honouring the contract's `Depends` pin.

**5. Found by running it live, fixed with tests.** Literal matching was case-sensitive (a real breach
was reported as no breach). Nothing recorded the bytes actually read (whole-page text digests added,
recomputed by every validator). A literal breach could never be agreed: the validator demanded a
non-empty span, so two live checks returned `MAJORITY_DISAGREE` and stored nothing — the rule kind now
travels with the result. A CDN served a stale copy to three consecutive checks while `curl` at the
same URL already saw the new text; the digest fields are what made that visible.

**6. Frontend.** `web/`, a Next.js reader holding no key and using only `NEXT_PUBLIC_` values; it fails
closed (missing configuration is shown as missing, a failed read as failed). Deployed to
https://surety-oxunify.vercel.app (Vercel project `surety`, scope `oxunify`; deployment protection
turned off). The same Chromium script used locally reported "no problems found in any page" against
the deployed URL at 1280×900 and 390×844, and the deployed home page renders the live counters.
A refused covenant shows a terminal state — the reason in plain words, that it cannot be activated
or retried, and the way forward — and no activate command; the command is rendered for
`AWAITING_ACTIVATION` only. One pure function (`web/lib/status.ts`) decides it, and the web test
compares its status list with the constants parsed out of `contracts/surety.py`.

**7. Limits, stated rather than implied.** Semantic rules, `absence_is_breach`, cooldown refusals and
list caps are covered by tests only — no semantic rule has ever been decided by a real validator set.
"Immutable" means the URL string, the owner's rules and the anchored citation digest, not the page.
GEN on Studionet carries no value, so every live bond is 0 and the contract says so in `stats()`.
`npm audit` reports 5 high advisories, all dev-only ESLint tooling, left unfixed because the forced
fix downgrades `eslint-config-next` to 14.x. `web/` deliberately does no server-side fetching of
covenant sources — that would be an SSRF surface for a feature a copyable command already provides.

**8. Artifacts.** https://github.com/unifyWeb3/surety (public, 10 commits). Design and findings:
`state/DESIGN.md` §11–§12, and the refusal findings in `state/DESIGN-refusal.md`. Build log:
`state/MEMORY.md`. Front door: `README.md`. Live tooling:
`scripts/` (keygen, deploy, create, activate, check, read, code and page digests). Suites:
`tests/direct/` (97) and `web/tests/` (20). No key is in git: `.env.surety` and `web/.env.local` are
ignored, and a literal search for the deployer key across every commit returns 0 hits.
