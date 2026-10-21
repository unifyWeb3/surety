/**
 * The status table the covenant page is built on.
 *
 * Three things are pinned here, and none of them can drift silently:
 *
 *  1. every status the contract defines maps to the right terminal / can-activate flags;
 *  2. no terminal status ever yields an activate command;
 *  3. the status list in `web/lib/status.ts` is exactly the set of statuses parsed out of
 *     `contracts/surety.py`, so a contract change that adds or renames a status fails this
 *     test instead of quietly desyncing the page.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { activateCommandFor, checkCommandFor } from "../lib/commands";
import { toneOf } from "../lib/format";
import { CONTRACT_STATUSES, canRequestCheck, statusView, type CovenantStatus } from "../lib/status";

/** Walk up from this file until the repository's contract is found. */
function contractPath(): string {
	let dir = __dirname;
	for (let i = 0; i < 8; i++) {
		const candidate = path.join(dir, "contracts", "surety.py");
		if (fs.existsSync(candidate)) return candidate;
		dir = path.dirname(dir);
	}
	throw new Error("could not find contracts/surety.py from " + __dirname);
}

/** The stored statuses the contract defines, read from the contract itself. */
function contractStatuses(): string[] {
	const source = fs.readFileSync(contractPath(), "utf8");
	const found = [...source.matchAll(/^STATUS_[A-Z_]+ = "([A-Z_]+)"$/gm)].map((m) => m[1]);
	assert.ok(found.length > 0, "no STATUS_ constants parsed from contracts/surety.py");
	return found;
}

const REFUSALS = [
	"REFUSED_PROMISE_ABSENT",
	"REFUSED_SUBJECT_ABSENT",
	"REFUSED_ALREADY_IN_BREACH",
	"REFUSED_SOURCE_UNREACHABLE",
];

test("the web status list is exactly the set of statuses the contract defines", () => {
	const fromContract = contractStatuses();
	const fromWeb = [...CONTRACT_STATUSES];

	assert.deepEqual(
		[...fromWeb].sort(),
		[...fromContract].sort(),
		"web/lib/status.ts and contracts/surety.py disagree about the statuses",
	);
	assert.equal(new Set(fromWeb).size, fromWeb.length, "duplicate status in the web list");
});

test("the contract defines the four refusal statuses the page knows about", () => {
	const fromContract = contractStatuses();
	for (const refusal of REFUSALS) {
		assert.ok(fromContract.includes(refusal), `${refusal} is not a contract status`);
	}
});

test("every contract status maps to the right terminal and can-activate flags", () => {
	const expected: Record<string, { terminal: boolean; canActivate: boolean }> = {
		AWAITING_ACTIVATION: { terminal: false, canActivate: true },
		ACTIVE: { terminal: false, canActivate: false },
		BREACHED: { terminal: true, canActivate: false },
		REFUSED_PROMISE_ABSENT: { terminal: true, canActivate: false },
		REFUSED_SUBJECT_ABSENT: { terminal: true, canActivate: false },
		REFUSED_ALREADY_IN_BREACH: { terminal: true, canActivate: false },
		REFUSED_SOURCE_UNREACHABLE: { terminal: true, canActivate: false },
	};
	assert.deepEqual(Object.keys(expected).sort(), [...CONTRACT_STATUSES].sort());

	for (const status of CONTRACT_STATUSES) {
		const view = statusView(status);
		assert.equal(view.terminal, expected[status].terminal, `${status} terminal`);
		assert.equal(view.canActivate, expected[status].canActivate, `${status} canActivate`);
		assert.ok(view.message.length > 0, `${status} has no message`);
	}
});

test("only AWAITING_ACTIVATION may be activated, because that is the only status the contract accepts", () => {
	const activatable = CONTRACT_STATUSES.filter((status) => statusView(status).canActivate);
	assert.deepEqual([...activatable], ["AWAITING_ACTIVATION"]);
});

test("no terminal status ever yields an activate command", () => {
	for (const status of CONTRACT_STATUSES) {
		const view = statusView(status);
		const command = activateCommandFor(status, "a".repeat(64));
		if (view.terminal) {
			assert.equal(command, null, `${status} is terminal but still produced a command`);
		}
		if (view.canActivate) {
			assert.ok(command !== null, `${status} may be activated but produced no command`);
			assert.ok(command.includes("activate_covenant.py"), command);
		} else {
			assert.equal(command, null, `${status} produced a command the contract would refuse`);
		}
	}
});

test("only ACTIVE may be re-checked, because that is the only status the contract accepts", () => {
	const checkable = CONTRACT_STATUSES.filter((status) => canRequestCheck(status));
	assert.deepEqual([...checkable], ["ACTIVE"]);
	for (const status of CONTRACT_STATUSES) {
		const command = checkCommandFor(status, "a".repeat(64));
		if (status === "ACTIVE") {
			assert.ok(command !== null, "ACTIVE produced no check command");
			assert.ok(command.includes("request_check.py"), command);
		} else {
			assert.equal(command, null, `${status} produced a check command the contract would refuse`);
		}
	}
});

test("a refusal offers no command of any kind", () => {
	for (const refusal of REFUSALS) {
		assert.equal(activateCommandFor(refusal, "a".repeat(64)), null, `${refusal} activate`);
		assert.equal(checkCommandFor(refusal, "a".repeat(64)), null, `${refusal} check`);
	}
});

test("every refusal says why, that it is final, and what to do instead", () => {
	const seen: string[] = [];
	for (const refusal of REFUSALS) {
		const view = statusView(refusal);
		assert.equal(view.terminal, true, `${refusal} is not terminal`);
		assert.equal(view.canActivate, false, `${refusal} may be activated`);
		assert.match(view.message, /cannot be activated or retried/, `${refusal} message`);
		assert.match(view.message, /new covenant/, `${refusal} message`);
		assert.match(view.message, /promise/, `${refusal} message`);
		seen.push(view.message);
	}
	assert.equal(new Set(seen).size, REFUSALS.length, "two refusals share a message");
});

test("a refusal names its own reason in plain words", () => {
	const reasons: Record<string, RegExp> = {
		// The contract reaches this status two ways: the deterministic token-coverage gate, and
		// the model saying the window does not assert the promise. The wording has to cover
		// both, so it says the promise could not be *shown* to be there, not that it is absent.
		REFUSED_PROMISE_ABSENT: /could not be shown to be in the source/i,
		REFUSED_SUBJECT_ABSENT: /subject was not found/i,
		REFUSED_ALREADY_IN_BREACH: /already broke the owner's own rule/i,
		REFUSED_SOURCE_UNREACHABLE: /source could not be read/i,
	};
	for (const [refusal, reason] of Object.entries(reasons)) {
		assert.match(statusView(refusal).message, reason, `${refusal} message`);
	}
});

test("an unknown status fails closed: no command, no claim", () => {
	for (const unknown of ["", "SOMETHING_NEW", "activated", "REFUSED_PROMISE_ABSENT ", "toString"]) {
		const view = statusView(unknown);
		assert.equal(view.canActivate, false, `${unknown} was activatable`);
		assert.equal(view.terminal, true, `${unknown} was not treated as terminal`);
		assert.equal(activateCommandFor(unknown, "a".repeat(64)), null, `${unknown} produced a command`);
		assert.equal(checkCommandFor(unknown, "a".repeat(64)), null, `${unknown} produced a check command`);
		assert.equal(canRequestCheck(unknown), false, `${unknown} was checkable`);
		assert.match(view.message, /does not recognise this status/, `${unknown} message`);
	}
});

test("no message promises a retry the contract cannot perform", () => {
	for (const refusal of REFUSALS) {
		const { message } = statusView(refusal);
		assert.doesNotMatch(message, /retry/i, `${refusal} message`);
		assert.doesNotMatch(message, /cost nothing/i, `${refusal} message`);
		assert.doesNotMatch(message, /try again/i, `${refusal} message`);
	}
});

test("every contract status has a stamp tone, and a refusal reads as refused", () => {
	for (const status of CONTRACT_STATUSES) {
		const tone = toneOf(status);
		assert.ok(tone, `${status} has no tone`);
	}
	for (const refusal of REFUSALS) {
		assert.equal(toneOf(refusal as CovenantStatus), "refused", `${refusal} tone`);
	}
	assert.equal(toneOf("ACTIVE"), "active");
	assert.equal(toneOf("BREACHED"), "breached");
	assert.equal(toneOf("AWAITING_ACTIVATION"), "awaiting");
});
