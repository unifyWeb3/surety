# Refusal behaviour — findings read from the code

Written before any change, under the steward feedback: the covenant page says activation can be
retried after a refusal and emits an activate command, but the contract makes every refusal terminal.
Decision already made: `contracts/surety.py` is NOT changed. The deployed contract at
`0x45BCF7584F706835562C37Fd821C08748667Ce5f` is byte-identical to the repo file (sha256
`65fed909baa3c42ea61707fb3d7c84fe14a4f109a2440bf31ae1d204caf0a6eb`, 45,497 bytes, re-read from
`gen_getContractCode` in this session), so the page and the docs are what must change.

## 1. Every status a refusal can leave, and why each is terminal

The contract defines seven stored statuses (`contracts/surety.py:42-48`):

```
42: STATUS_AWAITING = "AWAITING_ACTIVATION"
43: STATUS_ACTIVE = "ACTIVE"
44: STATUS_BREACHED = "BREACHED"
45: STATUS_REFUSED_ABSENT = "REFUSED_PROMISE_ABSENT"
46: STATUS_REFUSED_SUBJECT = "REFUSED_SUBJECT_ABSENT"
47: STATUS_REFUSED_BREACH = "REFUSED_ALREADY_IN_BREACH"
48: STATUS_REFUSED_UNREACHABLE = "REFUSED_SOURCE_UNREACHABLE"
```

A refusal can leave exactly four of them, and `activate` is the only method that writes any of them:

- `REFUSED_PROMISE_ABSENT` — deterministic gate when the quote's coverage is below 0.90 and the
  subject is present (`surety.py:425-435`, `status` at 427), or the model answers `asserted: false`
  (`surety.py:879-880`), or the validator reaches the same answer (`surety.py:914-915`).
- `REFUSED_SUBJECT_ABSENT` — deterministic gate when coverage is below 0.90 and the subject is not
  present (`surety.py:425-435`, `status` at 427).
- `REFUSED_ALREADY_IN_BREACH` — the owner's literal rule already fires on the fetched text
  (`surety.py:436-446`, `status` at 438), or the model answers `breached_now: true`
  (`surety.py:881-882`, mirror at `surety.py:916-917`).
- `REFUSED_SOURCE_UNREACHABLE` — the fetch produced no readable text (`surety.py:411-421`).

Those four are the only values accepted for storage, and they are written in one place
(`surety.py:942-952`):

```
942:         if status not in (
943:             STATUS_REFUSED_ABSENT,
944:             STATUS_REFUSED_SUBJECT,
945:             STATUS_REFUSED_BREACH,
946:             STATUS_REFUSED_UNREACHABLE,
947:         ):
948:             raise gl.vm.UserError("[EXPECTED] activation produced no usable status")
949:         covenant.status = status
950:         covenant.activation_by = _addr_hex(gl.message.sender_address)
951:         self.activation_refusals = u256(int(self.activation_refusals) + 1)
952:         return status
```

The activate guard makes every one of them terminal:

```
840:         covenant = self.covenants.get(covenant_id)
841:         if covenant is None:
842:             raise gl.vm.UserError("[EXPECTED] unknown covenant")
843:         if covenant.status != STATUS_AWAITING:
844:             raise gl.vm.UserError("[EXPECTED] covenant is not awaiting activation")
```

There is no transition back to `AWAITING_ACTIVATION`: `create_covenant` writes it only on a brand
new record (`surety.py:809`), and no other write touches the field. `request_check` is also closed
to a refused covenant:

```
960:         covenant = self.covenants.get(covenant_id)
961:         if covenant is None:
962:             raise gl.vm.UserError("[EXPECTED] unknown covenant")
963:         if covenant.status != STATUS_ACTIVE:
964:             raise gl.vm.UserError("[EXPECTED] covenant is not active")
```

**Answer: ALL FOUR activation refusals are terminal.** `REFUSED_PROMISE_ABSENT`,
`REFUSED_SUBJECT_ABSENT`, `REFUSED_ALREADY_IN_BREACH` and `REFUSED_SOURCE_UNREACHABLE` can never be
activated again and can never be checked. `BREACHED` is terminal for the same reason (only `REQUEST_CHECK`
requires ACTIVE and only `activate` requires AWAITING). The only recovery is a new covenant under a
new (owner, label), which derives a new id (`surety.py:788-791`, `surety.py:696-699`). There is no
"reset", "retry", "reopen" or "edit" method on the contract.

## 2. Places in web/ and the docs that imply a retry or emit an activate command

| # | File and line | What it says / does | Does it match the contract? |
|---|---|---|---|
| W1 | `web/app/covenant/[id]/page.tsx:200-209` | For every non-`AWAITING_ACTIVATION` empty-citation case: "Retrying activation is allowed and costs nothing:" followed by `{activateCommand(c.covenant_id)}`. This is the reported bug. It renders a command the contract rejects for all four refusal statuses. | **No.** The contract rejects it at `surety.py:843-844`. |
| W2 | `web/app/covenant/[id]/page.tsx:192-199` | For `AWAITING_ACTIVATION`, "Any address may run it:" and the activate command. | **Yes.** This is the one status the contract allows `activate` for. Keep it, but gate it from the new pure function. |
| W3 | `web/lib/format.ts:78-86` | `statusSentence` for the four refusals says only "never went active"; `REFUSED_SOURCE_UNREACHABLE` says "Nothing was proven either way." It never says the refusal is terminal, so it does not correct W1. | **Incomplete.** A refusal is final, and the page must say so. |
| W4 | `web/components/Stamp.tsx:34-36` | `StatusLine` renders `statusSentence`; currently unused elsewhere, but it is a second path that could resurface the non-terminal wording. | **Incomplete.** Remove the duplicate path. |
| W5 | `web/app/page.tsx:170-174` | "A refusal means nothing could be proven — an unreachable source, a promise that was not in the page. It is not an accusation and changes no verdict." Read with an "unreachable source", it suggests the condition may clear and be tried again. | **Incomplete.** Add the finality fact without changing the design. |
| W6 | `README.md:43-49` | "Otherwise it becomes a durable refusal status, readable forever: ..." — durable but never says terminal / cannot be retried. | **Incomplete.** Say the four are terminal and why. |
| W7 | `README.md:122-125` | "It could not be made active by asking." | **True but weak.** Name the terminal status and the rejected call explicitly. |
| W8 | `state/DESIGN.md:173-185` | The state-machine diagram puts "(terminal)" under `ACTIVE` (line 179), not under the four refusals, and never labels the refusal row as terminal. | **Misleading.** Fix the diagram annotation; no contract change. |
| W9 | `state/DESIGN.md:187-192` | "A refused activation is a durable, readable record, not a silent no-op" — does not say it is final. | **Incomplete.** Add the terminal fact and the single-entry guards. |
| W10 | `scripts/activate_covenant.py:5` | "On refusal it is refused, permanently, and the reason is a status." | **Correct already.** No change required. |
| W11 | `scripts/activate_covenant.py:41-44` | Prints the next `request_check` command only when ACTIVE; exits 1 otherwise, but does not state what a refusal means. | **Incomplete output.** Add one honest line: refusal is final; create a new covenant. |
| W12 | `web/app/error.tsx:27` | "Try again" resets a failed *page render*. It is not a contract call and makes no claim about a covenant. | **Not a contract recovery path.** Deliberately unchanged; recorded here so the sweep is complete. |
| W13 | `web/lib/chain.ts:19-23,88` | One bounded retry on a transport-level *read*. A definite contract answer is never retried. | **Not a covenant recovery path.** Deliberately unchanged. |
| W14 | `web/README.md` | No retry claim, but no statement of refusal finality either. | **Incomplete.** Add one trust-note line. |

## 3. What the page must do instead

- `AWAITING_ACTIVATION`: may show the activate command (the only status the contract allows it for).
- The four `REFUSED_*`: show the refusal reason in plain words, say the covenant cannot be activated
  or retried, offer the real next step (create a new covenant whose promise is in the source), and
  render **no** activate command.
- `BREACHED`: terminal too; no activate command, no check command (the last-check section already
  handles this).
- `ACTIVE`: no activate command; the check command stays.
- Unknown status: fail closed — no command, neutral message.

One pure `status -> {terminal, canActivate, message}` function in `web/lib/` is the single source for
all of the above. Its status list is compared against the constants parsed from
`contracts/surety.py` in the web test, so a future contract change cannot silently desync the page.

## 4. What was changed, and where

| Finding | Fix | Test |
|---|---|---|
| W1 | `web/components/NothingCited.tsx` (new) renders the empty-citation state; the activate command comes from `activateCommandFor(status, id)`, which returns `null` unless `statusView(status).canActivate`. The raw `activateCommand` is no longer exported, so no page can build one for a status the contract would refuse. | `web/tests/status.test.ts` "no terminal status ever yields an activate command"; `web/tests/covenant-page.test.tsx` "a refused covenant is shown no activate command at all" |
| W2 | Same gate. The `AWAITING_ACTIVATION` branch still shows the command, because that is the one status the contract accepts. | "only AWAITING_ACTIVATION may be activated"; "a covenant awaiting activation is offered the activate command" |
| W3 | `web/lib/status.ts` (new) holds one message per status; `statusSentence` in `web/lib/format.ts` was deleted so there is no second wording. `web/components/Stamp.tsx`'s unused `StatusLine` was deleted with it. | "every refusal says why, that it is final, and what to do instead"; "a refusal names its own reason in plain words" |
| W4 | Deleted with W3. | — |
| W5 | `web/app/page.tsx` now says a refusal is final and that the way forward is a new covenant. | `web/tests/copy-sweep.test.ts` |
| W6 | `README.md` §"How a covenant moves" now states that all four refusals are terminal, with the two contract guards quoted. | `web/tests/copy-sweep.test.ts` |
| W7 | `README.md` §"The deployed instance" names the terminal status and the rejected call. | `web/tests/copy-sweep.test.ts` |
| W8 | `state/DESIGN.md` §3 state machine: the refusal row is now marked terminal, and the bullets name both guards with their line numbers. | `web/tests/copy-sweep.test.ts` |
| W9 | Same bullets. | `web/tests/copy-sweep.test.ts` |
| W10 | Already correct; unchanged. | — |
| W11 | `scripts/activate_covenant.py` now prints, on a refusal, that the refusal is final and that the way forward is a new covenant. | `web/tests/copy-sweep.test.ts` (the sweep covers `scripts/`) |
| W12 | Deliberately unchanged: it resets a failed *page render*, not a contract call. | — |
| W13 | Deliberately unchanged: a bounded retry on a transport-level *read*. A definite contract answer is never retried. | — |
| W14 | `web/README.md` gained a trust note on the terminal state and on the one function that decides it. | `web/tests/copy-sweep.test.ts` |

The contract's own behaviour is pinned on the other side too, in
`tests/direct/test_refusal_terminal.py`: every refusal status is produced by the real contract
code path, a second `activate` is refused with the contract's own error and changes nothing, a
`request_check` on a refused covenant is refused too, and a covenant whose promise really is in
the source activates through the same path (the positive control).

## 5. Red state, as measured

Against the pre-fix tree (`git worktree` of `0f3b9d7` plus the new tests), the new web suite
failed 6 of 6 and exited 1: the copy sweep named `web/app/covenant/[id]/page.tsx` as still
offering a retry, the page-source tests failed on the ungated command and the retry copy, and a
harness that renders the old page's own JSX printed

> Nothing was cited, because nothing was proven. An activation refusal stores no quote and no
> digest — a refusal is not evidence, and this contract does not pretend otherwise. Retrying
> activation is allowed and costs nothing: `python scripts/activate_covenant.py --id 'aaaa…'`

against the assertion that a refused covenant renders no activate command. The contract suite
passed 6 of 6 against the unchanged contract, which is the point: the contract was already
terminal, and only the page was wrong.

