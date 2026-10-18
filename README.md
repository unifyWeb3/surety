# Surety

A GenLayer protocol for putting economic weight behind one public promise, and for making the
promise's disappearance or contradiction a matter of public record.

An owner writes down one promise made in one public web page, names the rule that counts as
breaking it, and registers a bond they mean to stand behind. Validators then fetch that page
themselves and prove the promise is really in it before the covenant can go active. After that
anyone at all can ask for a re-check, and the owner's own rule decides.

**It is a commitment-and-verification protocol. It is not escrow, not arbitration, and not a
court.** There is no transfer, withdraw, claim or payout method in the contract — a breach changes
a status and pays nobody. See "The trust model" for why that is a design decision rather than an
omission.

---

## The problem this actually solves

A promise made in a document is worth something only if a third party can later check two things:
that the words were really there, and whether they are still. Both are hard over HTTP. A page can
be edited, rewritten, moved, or served from a cache; nothing obliges anyone to keep the version
you read. "Immutable source" is not a property the web offers.

Surety's answer is to make every claim about the source re-derivable by someone who does not trust
the party who recorded it:

- a covenant is **anchored to a pinned URL string** and to a bounded citation window taken from it,
- the window is stored as `anchor_quote` plus `anchor_digest = sha256(normalize(quote))`, where
  every validator recomputed the digest from its own fetch,
- each re-check re-fetches, re-derives the best quote for the same promise, and reports whether it
  still digests to the anchor value; that is what "anchor drift" means here,
- and the digest of the **whole text each check actually read** is stored too, so a reader can
  fetch the URL themselves and see whether the contract was reading a stale copy.

## How a covenant moves

1. **Create** — `create_covenant(label, source_url, subject, promise_text, breach_rule,
   permitted_changes, beneficiary, bond_declared_atto, absence_is_breach, check_cooldown_seconds)`.
   The covenant id is `sha256(owner + "|" + normalize(label))`, so an id belongs to its creator and a
   caller cannot create a record about an arbitrary address. Every write takes no address argument at
   all; the owner is `gl.message.sender_address`.
2. **Activate** — `activate(covenant_id)`. The contract fetches the pinned URL. A deterministic
   token-window match must locate the promise text, produce a bounded quote, and prove the
   owner-declared subject is inside that quote. Only then does the covenant become `ACTIVE`, with the
   anchor fields written. Otherwise it becomes a durable refusal status, readable forever:
   `REFUSED_PROMISE_ABSENT`, `REFUSED_SUBJECT_ABSENT`, `REFUSED_ALREADY_IN_BREACH`,
   `REFUSED_SOURCE_UNREACHABLE`. A URL that is not `https`, has userinfo, a fragment, an IP host or
   an unlisted host is rejected before any fetch happens.
3. **Check** — `request_check(covenant_id)`, permissionless and rate limited by the owner's cooldown
   (refused with `[EXPECTED] check cooldown has not elapsed (n of m seconds)`). The check fetches
   again, re-derives the promise's quote, evaluates the owner's rule, and records one of `BREACH`,
   `NO_BREACH`, `PROMISE_ABSENT` or `UNREACHABLE`. A breach flips the status to `BREACHED`
   permanently; a covenant that is not `ACTIVE` is refused with `[EXPECTED] covenant is not active`;
   a check that validators cannot agree on stores nothing at all.

The rule language is closed on purpose: `literal-absent:<text>` (a breach if the text is **absent**),
`literal-present:<text>` (a breach if the text **is present**), and `semantic:<sentence>`. Literal
rules are decided by case-folded string presence with **no language model in the loop**, which is what
lets every literal-rule refusal be tested with a positive control that does not depend on a model.

## What is pinned, and what "immutable" can honestly mean

The contract cannot make a URL immutable. What it pins is stated exactly:

| Pinned | Stored as | Enforced by |
|---|---|---|
| the source | the URL string, unmodifiable after creation | comparison of the stored string |
| the promise | `promise_text` as the owner wrote it | token-window match must find it in the fetched text |
| the evidence | `anchor_quote` + `anchor_digest` | every validator recomputes `sha256(normalize(quote))` |
| the owner's rules | `breach_rule`, `absence_is_breach`, `subject`, cooldown | compared as values, never re-written |
| what each check read | `anchor_text_digest`, `last_check_text_digest` | `sha256(normalize(whole fetched text))`, validator-recomputed |

Normalization is deterministic and documented: HTML stripped, NFKC, whitespace collapsed, capped at
200,000 characters. Two honest limits are written down in `state/DESIGN.md` rather than papered
over: normalization means "verbatim after normalization", and a CDN may serve a stale copy for as
long as its `max-age`. The second was observed live (see below), and it is exactly what the page
digests exist to make visible. A revision-pinned URL avoids it.

## The trust model

**The leader proposes; nobody trusts the leader.** Activation and checks run once as the leader and
then again inside every validator node, which repeats the fetch and re-derives the same evidence. The
contract supplies its own comparison closure (`gl.vm.run_nondet_unsafe`) and it returns false on any
field that differs, so a state change is applied only when the validators' own fetches agree:

- no free-text rationale is persisted anywhere — the stored evidence is an enum, a bounded quote
  each validator proved is a substring of its own fetch, and digests each validator recomputed;
- the rule kind travels with the result: a semantic breach must cite a span the validator can find
  in its own text, a literal breach must cite none;
- a disagreement stores nothing at all — the check is simply not recorded.

Two consequences worth stating plainly:

- **No unauthenticated caller can create global state about someone else.** Writes take no address
  parameter; a covenant belongs to `gl.message.sender_address`, and a check can only move a
  covenant the owner already made.
- **The bond is recorded, not held.** `bond_sent_atto` is `gl.message.value`; `bond_declared_atto` is
  the owner's claim in a field labelled as a claim. Since no money can move in this contract, and
  `stats()` reports `"network_value": "none: the bond is recorded, not held"`, a reader is never
  invited to believe otherwise. On Studionet, GEN carries no value at all and every live bond is 0.

## The deployed instance (Studionet)

| | |
|---|---|
| Contract | `0x45BCF7584F706835562C37Fd821C08748667Ce5f` |
| RPC | `https://studio.genlayer.com/api` |
| Code | 45,497 bytes, sha256 `65fed909baa3c42ea61707fb3d7c84fe14a4f109a2440bf31ae1d204caf0a6eb` |
| Proof | `.venv-deploy/bin/python scripts/verify_code.py` — `gen_getContractCode` (base64) decoded and compared byte for byte with `contracts/surety.py`: `identical: yes` |
| Counters | `{covenants: 2, checks: 1, breaches: 1, activation_refusals: 1}` |

Two covenants were run end to end against a real gist whose promise was later contradicted:

- `074f5509…903e4a` — "We never sell or share subscriber email addresses with third parties."
  Activated, then after the source gained the sentence "We may sell subscriber email addresses with
  third parties" a check returned `MAJORITY_AGREE`, verdict `BREACH`, `quote_present true`,
  `rule_span ""` (a literal rule cites no span), and `last_check_text_digest 2eb80ce4…` equal to the
  digest an independent `scripts/page_digest.py` fetch of the same URL produced. Status is `BREACHED`
  and a further check is refused: transaction `0x102e21f5…` came back `FINALIZED / MAJORITY_AGREE`
  with the contract's answer `[EXPECTED] covenant is not active` and no state change.
- `61a57de7…2677d64` — a promise ("We publish a signed audited financial statement every
  quarter.") that was never in the source. Validators agreed it was not there:
  `REFUSED_PROMISE_ABSENT`, `is_active false`, no anchor quote and no anchor digest. It could not be
  made active by asking.

### Learned live, and fixed with tests

- **Literal matching was case-sensitive** (L1): a real breach was reported as no breach. Both sides
  are now case-folded.
- **A literal breach could never be agreed** (L3): the validator demanded a non-empty span for every
  breach, so a truthful literal breach with no span to cite was rejected — two live checks returned
  `MAJORITY_DISAGREE` and stored nothing. The rule kind now travels with the result. Found only
  because the run was live: direct mode runs the leader alone.
- **A stale CDN copy** was read by three consecutive checks while `curl` at the same URL already
  returned the new text; the differing page digest is how it became visible.
- **An inverted rule was caught at activation** (`REFUSED_ALREADY_IN_BREACH`), which is why the
  composer on `/new` states the direction of a rule in plain words.

## What is proven live, and what is only proven in tests

Honest split, because the difference matters when reading either.

**Proven by live transactions on Studionet:** deployment with byte-identical code; activation of a
promise that is really in the source; refusal of a promise that is not; a literal-rule breach agreed
by validators with a page digest matching an independent fetch; a check on an inactive covenant
being refused with no state change.

**Proven only by the direct-mode suite** (91 tests, 0 skips): the `semantic:` path and its span rule;
`absence_is_breach`; the cooldown refusal; `UNREACHABLE` and `PROMISE_ABSENT` verdicts; the
subject-absent refusal; list caps; every refusal paired with a positive control; and the boundary
conditions of validation. Live coverage of a semantic rule has **not** been run, so no claim is made
that a real validator set has ever agreed on one. The suite reaches validator code by replaying the
captured validator closure against mocks (`tests/direct/test_validators.py`,
`tests/direct/test_live_findings.py`); direct mode otherwise runs the leader alone, which is precisely
how L3 survived a green suite.

## Run it

```bash
# tests — 91 passed
.venv/bin/python -m pytest tests/direct/ -q

# lint and SDK validation
.venv/bin/genvm-lint check contracts/surety.py

# prove the deployed code is this repository's file
.venv-deploy/bin/python scripts/verify_code.py

# live commands (their own venv: the test harness pins an older genlayer-py)
.venv-deploy/bin/python scripts/deploy.py
.venv-deploy/bin/python scripts/create_covenant.py …
.venv-deploy/bin/python scripts/activate_covenant.py --id …
.venv-deploy/bin/python scripts/request_check.py --id …
.venv-deploy/bin/python scripts/read_covenant.py --id …
.venv-deploy/bin/python scripts/page_digest.py <url> --compare <digest from the covenant>

# the reader
cd web && npm install && cp .env.example .env.local && npm run build && npm run start
```

`genvm-lint check` prints `✓ Lint passed (3 checks)` on a bare run and then fails SDK validation with
`Failed to load SDK: HTTP Error 404` on `genvm-universal.tar.xz`: the linter resolves the newest
runner tag instead of honouring the contract's `Depends` pin. With the supported `GENVMROOT` path it
prints `✓ Validation passed / Contract: Surety / Methods: 10 (7 view, 3 write)`.

## Notes on the web reader

`web/` is a Next.js app that reads the chain and composes commands. It **holds no key and never
signs** — writes are shown as the repository's own `scripts/…` commands, and only `NEXT_PUBLIC_`
variables are used. It fails closed: a missing configuration is reported as a missing configuration
rather than shown as an empty register, and a failed read is shown as a failed read, never as a
zero. It does not proxy covenant sources through a server, which would be an SSRF surface; a reader
who wants to check a digest themselves runs `scripts/page_digest.py`.

`npm audit` reports 5 high-severity advisories, all in dev-only ESLint tooling. They are deliberately
not fixed: `npm audit fix --force` resolves them by downgrading `eslint-config-next` to 14.x.

## Layout

- `contracts/surety.py` — the whole protocol, one contract, no binding transaction.
- `tests/direct/` — the suite, including the red-team table and the live findings.
- `scripts/` — key generation, deploy, create/activate/check/read, code and page digests.
- `web/` — the reader and the covenant composer.
- `state/DESIGN.md` — the design, the red-team table, and the adversarial self-review findings.
- `state/MEMORY.md` — the build log: what was learned, and what was wrong earlier.
