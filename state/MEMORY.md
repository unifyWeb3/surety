# MEMORY — Surety (decision log, resume point)

Product: **Surety** — a GenLayer-native protocol for putting economic weight behind one public
promise at one pinned HTTPS source. Working dir `/root/covenant-build`.

Updated as work proceeds. If a session drops, start at "LEFT OFF".

---

## LEFT OFF

Stage 0 in progress. See the bottom of this file for the live "next action" line.

---

## Stage 0 — research (what was confirmed, and where)

Everything below was read from the installed sources or the live docs, not from memory.

### Runner pin and SDK surface

| Fact | Evidence |
|---|---|
| Pin header for contracts | `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }` — genlayer-dev skill `write-contract/SKILL.md`, and the runner.json of the extracted runner names exactly this std-lib hash. |
| Std lib source tree | `/root/.cache/gltest-direct/extracted/v0.2.16/py-lib-genlayer-std/11rhn002yfajawsz7fai6mykznbxkxs6l91iskj5cm82c92qhy3v/` |
| `gl.nondet.web.get/post/request` return `Response(status: int, headers: dict[str,bytes], body: bytes|None)` | read directly in `genlayer/gl/nondet/web.py`. **Docs are wrong**: `features/web-access.md` says `response.status_code`. The field is `.status`. |
| `gl.nondet.web.render(url, mode="html"|"text"|"screenshot", wait_after_loaded=...)` returns `str` for text/html | same file. |
| Leader/validator + error classification | `genlayer/gl/vm.py` (`Return.calldata`, `VMError`, `UserError`), `genlayer/gl/eq_principle.py` (`strict_eq` = `run_nondet_unsafe` with sandboxed rerun and `==`; `prompt_comparative`/`prompt_non_comparative` use the node-tunable `EqComparative`/`EqNonComparative*` prompt templates). |
| Equivalence doctrine | docs `equivalence-principle.md`: "never treat the leader's result as trusted input"; a validator that only checks calldata *shape* is not consensus. Independent re-derivation is the default. |
| Storage | docs `features/storage.md` + `types/collections.md` + `write-contract` skill: class-level annotations are the storage slots; `TreeMap`/`DynArray` only; `list`/`dict` not persistable; `@allow_storage @dataclass` for records; `u256`/`i256` sized ints; store enum `.value` as `str`. |
| Deterministic time | `gl.message_raw["datetime"]` (ISO-8601 UTC string). `gl.message` has `sender_address`, `value`, `contract_address`. Never `datetime.now()`. |
| Finality | docs `optimistic-democracy/finality.md` + `transaction-statuses.md`: ACCEPTED ≠ final; a tx can be accepted/finalized with an execution error and then applies **no** state changes. Always assert execution success before reading state. |

### Linter / test harness

| Fact | Evidence |
|---|---|
| `genvm-lint check` 404s on `genvm-universal.tar.xz` | Prior verified note in `/root/cordon/state/MEMORY.md` (genvm-linter 0.10.0 builds the URL from the **latest** tag, ignoring the contract pin; upstream renamed the asset). Reproduced/confirmed here in Stage 2 — see the Stage 2 section below for this session's exact output. |
| Supported path when it 404s | `$GENVMROOT` → `sdk_loader.get_sdk_paths_from_genvmroot()`, expecting `<root>/runners/py-lib-genlayer-std/src`. Both the linter and `gltest` share `~/.cache/gltest-direct`, so point it at the std-lib tree already extracted there. |
| Direct-mode fixtures come from `gltest.direct.pytest_plugin`; entry point `gltest_direct` | `genlayer_test-0.28.0.dist-info/entry_points.txt`, `gltest/direct/pytest_plugin.py` (`direct_vm`, `direct_deploy`, `direct_alice/bob/charlie/owner`, `direct_accounts`). |
| Direct-mode mocks | `gltest/direct/vm.py`: `mock_web(url_regex, {"status":..,"body":..})`, `mock_llm(prompt_regex, response)`, `clear_mocks()`, `expect_revert(msg)`, `prank(addr)`, `deal(addr, wei)`, `warp(iso)`, `snapshot()/revert()`. `wasi_mock.py` handles both `WebRequest` and `WebRender` through the same mock list. |
| Direct mode runs the **leader only** | `direct-tests/SKILL.md` — "validator logic is not exercised". Therefore validator functions must be reachable from tests directly, not only through a write method. That shapes the contract's code layout (module-level pure validator helpers). |
| `genlayer-test==0.28.0` hard-pins `genlayer-py==0.9.0` | installed in `.venv` here; a current deploy SDK cannot share that environment. Two venvs, deliberately. |

### Projects in the space (read, distilled, not copied)

**`Ifem1/Driftlock`** (GitHub, read 2026-10-18 — README, `docs/LIVE_VALIDATION.md`,
`contracts/source_inspector.py`). "Stake a public promise. Prove when it changes." Three contracts:
`DriftRegistry` (escrow/deadlines/credits/settlement), `SourceInspector` (baseline + current
inspection), `BreachJudge`. Findings:

- Its own docs say it **stores no source digest and no historical snapshot** — "a bounded semantic
  baseline result". So the claim "this promise was supported by this source" is unanchored: nothing
  reproducible is persisted that a third party can re-derive. Its live-validation page also states
  no complete lifecycle transaction set is included and that the fresh deployment has zero
  covenants.
- Its validator compares `status` + the seven boolean fields, **not** `basis` — while `basis` is a
  leader-authored free-text string that is persisted and surfaced. That is exactly the failure mode
  in the brief's lesson 1 (a persisted evidence field no validator recomputed).
- Every path is an LLM boolean judgment. There is no deterministic branch, so there is no positive
  control that can be asserted without the model.
- It is explicitly escrow-shaped: challenger bonds, finder rewards, claimable credits, a separate
  judge contract. The brief for this product rules that framing out.
- Structural complexity is a cost: 3 contracts + a one-time binding transaction, where a failed or
  replayed binding is its own failure mode.

**Similar projects seen while surveying** (GitHub topics `genlayer`, `intelligent-contracts`):
`genjury` (AI jury mini-games), `pact1` (plain-language agreements judged by an AI jury, verdict
releases escrow), `genlayer-reputation-ledger`, `freelance-escrow`, `bullshit-detector`,
`bounty-hunter-genlayer`. Every one of them is either game, escrow, or reputation. None of them is a
commitment-and-verification protocol with a content-anchored activation gate.

**What Surety does differently** — these are the deltas, not a restatement:

1. **Content-anchored activation.** The activation decision is not "the model said yes". Validators
   must independently re-fetch and prove that the owner's promise text is physically present in the
   source: a deterministic token-window match must produce a bounded quote, that quote must contain
   the owner-declared subject, and `sha256(normalize(quote))` must equal the digest the leader
   reported. A model that says "supported" cannot put a covenant into ACTIVE over a source that does
   not contain the promise.
2. **No unverified text is ever persisted.** There is no free-text rationale field. The stored
   evidence is an enum, a bounded quote that each validator proved is a substring of its own fetch,
   and a digest each validator recomputed. The `basis`-style field Driftlock keeps is deliberately
   absent.
3. **A deterministic breach-rule branch.** `literal-absent:` / `literal-present:` rules are decided
   by string presence and use `strict_eq`-style consensus with no LLM in the loop at all. That gives
   every refusal a positive control that does not depend on a model.
4. **Not escrow, not a court.** One contract, no challenger bond, no finder reward, no payout path
   at all. A breach is a permanent, publicly readable verdict on a promise. The stake is an
   authenticated recorded bond, and the docs say plainly that on Studionet it carries no value.
5. **Honest immutability.** The briefing's "immutable source" is impossible over HTTP, so Surety says
   what it actually pins: the URL, the normalized promise-evidence region, and the owner's rules.
   Drift is reported as "the anchored evidence region is no longer byte-identical" — a claim both
   leader and validator derive from values each of them computed.

### Product name

Chosen: **Surety**. One word; a surety bond is precisely economic weight put behind another party's
promise, which is the whole product. Checked 2026-10-18 with
`gh api repos/unifyWeb3/<name>` (all 404 = free) and `gh search repos <name>` for clashes.

Rejected: `covenant` (paritytech's early `covenant` smart-contract language, plus the word is a
generic term here); `beacon` (Ethereum Beacon Chain); `warrant` (the widely used Warrant authz
library); `attest` (Ethereum Attestation Service / Attest.com); `warden` (Warden Protocol);
`promise` (JS Promise — meaningless as a repo name); `pledge` (Pledgecamp, and generic); `bond`
(generic, thousands of hits); `troth`, `vadium`, `avouch` (free but obscure: a name nobody can
decode is not a name). Closest surviving hits for "surety" are a typeface and a Udacity course
project — neither is a protocol.

---

## Stage 1 — design

Written to `state/DESIGN.md` before any contract code. Nothing in Stage 1 repeats the research
above; the design file is the deliverable.
