/**
 * The contract's stored statuses, and what the page may do with each.
 *
 * This is the single source of truth for the covenant page. `statusView` decides whether a
 * status is terminal, whether an activate command may be shown, and the words a reader sees.
 * The page renders an activate command only when `canActivate` is true; no terminal status can
 * ever produce one, because every terminal status has `canActivate: false`.
 *
 * The status list is not allowed to drift from the contract: `web/tests/status.test.ts` parses
 * `contracts/surety.py` and fails if the two lists differ. Unknown statuses fail closed.
 */

export const CONTRACT_STATUSES = [
	"AWAITING_ACTIVATION",
	"ACTIVE",
	"BREACHED",
	"REFUSED_PROMISE_ABSENT",
	"REFUSED_SUBJECT_ABSENT",
	"REFUSED_ALREADY_IN_BREACH",
	"REFUSED_SOURCE_UNREACHABLE",
] as const;

export type CovenantStatus = (typeof CONTRACT_STATUSES)[number];

export type StatusView = {
	/** True when the contract offers no further transition from this status. */
	terminal: boolean;
	/** True only for the one status the contract's `activate` accepts. */
	canActivate: boolean;
	message: string;
};

type StatusEntry = StatusView & {
	/** True only for the one status the contract's `request_check` accepts. */
	canCheck: boolean;
};

const VIEWS: Record<CovenantStatus, StatusEntry> = {
	AWAITING_ACTIVATION: {
		terminal: false,
		canActivate: true,
		canCheck: false,
		message:
			"Nobody has proved the promise is in the source yet. Nothing is being watched. Any address may run the activation.",
	},
	ACTIVE: {
		terminal: false,
		canActivate: false,
		canCheck: true,
		message:
			"Validators found the promise in the pinned source. Anyone may now ask for a re-check, and a breach found by the owner's own rule is permanent.",
	},
	BREACHED: {
		terminal: true,
		canActivate: false,
		canCheck: false,
		message:
			"A check found the owner's own rule broken. This status is permanent: the covenant cannot be activated again and cannot be re-checked. A new covenant is a new record; it does not change this one.",
	},
	REFUSED_PROMISE_ABSENT: {
		terminal: true,
		canActivate: false,
		canCheck: false,
		message:
			"Activation was refused because the promise could not be shown to be in the source. This refusal is final: the covenant cannot be activated or retried. The way forward is a new covenant with a promise that really is in the source.",
	},
	REFUSED_SUBJECT_ABSENT: {
		terminal: true,
		canActivate: false,
		canCheck: false,
		message:
			"Activation was refused because the subject was not found in the source. This refusal is final: the covenant cannot be activated or retried. The way forward is a new covenant whose promise and subject really are in the source.",
	},
	REFUSED_ALREADY_IN_BREACH: {
		terminal: true,
		canActivate: false,
		canCheck: false,
		message:
			"Activation was refused because the source already broke the owner's own rule, so the covenant would have started life in breach. This refusal is final: the covenant cannot be activated or retried. The way forward is a new covenant whose promise is in the source and whose rule the source does not already break.",
	},
	REFUSED_SOURCE_UNREACHABLE: {
		terminal: true,
		canActivate: false,
		canCheck: false,
		message:
			"Activation was refused because the source could not be read, so nothing was proven. This refusal is final: the covenant cannot be activated or retried. The way forward is a new covenant pointing at a source that can be read, with a promise that really is in it.",
	},
};

/**
 * Unknown statuses fail closed: no command is offered, and the message makes no claim about
 * what the contract did or what it will accept.
 */
const UNKNOWN: StatusEntry = {
	terminal: true,
	canActivate: false,
	canCheck: false,
	message:
		"This page does not recognise this status, so it makes no claim about it and offers no command. The record shown below is the contract's own answer.",
};

function entryFor(status: string): StatusEntry {
	if (!Object.prototype.hasOwnProperty.call(VIEWS, status)) {
		return UNKNOWN;
	}
	return VIEWS[status as CovenantStatus];
}

export function statusView(status: string): StatusView {
	return entryFor(status);
}

/**
 * Whether a re-check may be asked for: the contract's `request_check` accepts only `ACTIVE`.
 *
 * Read from the same table as `statusView`, so the page cannot offer a check the contract
 * would refuse either.
 */
export function canRequestCheck(status: string): boolean {
	return entryFor(status).canCheck;
}

export function isCovenantStatus(value: string): value is CovenantStatus {
	return (CONTRACT_STATUSES as readonly string[]).includes(value);
}
