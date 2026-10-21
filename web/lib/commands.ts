/**
 * The commands this page composes.
 *
 * This app holds no key and signs nothing, so the honest thing for a compose page to hand over is
 * the exact transaction: the arguments, the id the contract will derive, and the command that
 * sends it. The commands are the repository's own scripts, so the text on this page is the text
 * that was actually run against the live contract.
 *
 * `activateCommand` is deliberately NOT exported. The contract's `activate` accepts only a
 * covenant that is `AWAITING_ACTIVATION`, and every activation refusal is terminal, so the
 * activate command must never be reachable for a status the contract would refuse. Callers go
 * through `activateCommandFor`, which asks `statusView` and returns null for anything else.
 */

import { canRequestCheck, statusView } from "./status";

export type CreateArgs = {
	label: string;
	sourceUrl: string;
	subject: string;
	promise: string;
	rule: string;
	permitted: string;
	beneficiary: string;
	bond: string;
	absenceIsBreach: boolean;
	cooldown: string;
};

/** Single-quote for a POSIX shell, escaping embedded quotes the standard way. */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function flag(name: string, value: string): string {
	return `  --${name} ${shellQuote(value)} \\`;
}

export function createCommand(args: CreateArgs): string {
	const lines = [
		"python scripts/create_covenant.py \\",
		flag("label", args.label),
		flag("source-url", args.sourceUrl),
		flag("subject", args.subject),
		flag("promise", args.promise),
		flag("rule", args.rule),
		flag("permitted", args.permitted),
		flag("beneficiary", args.beneficiary),
		flag("bond", args.bond),
		flag("cooldown", args.cooldown),
		args.absenceIsBreach
			? "  --absence-is-breach"
			: "  --absence-is-not-breach",
	];
	return lines.join("\n");
}

function activateCommand(id: string): string {
	return `python scripts/activate_covenant.py --id ${shellQuote(id)}`;
}

/**
 * The activate command, or null when the contract would refuse the call.
 *
 * The gate is the contract's own: `activate` requires `AWAITING_ACTIVATION`, and a refused
 * covenant is terminal, so there is nothing to retry. A null return means the page must render
 * no command at all.
 */
export function activateCommandFor(status: string, id: string): string | null {
	return statusView(status).canActivate ? activateCommand(id) : null;
}

/**
 * The re-check command, or null when the contract would refuse the call.
 *
 * `request_check` accepts only an `ACTIVE` covenant, so the gate is the contract's own, read
 * from the same table as the activate gate.
 */
export function checkCommandFor(status: string, id: string): string | null {
	return canRequestCheck(status) ? checkCommand(id) : null;
}

function checkCommand(id: string): string {
	return `python scripts/request_check.py --id ${shellQuote(id)}`;
}

export function readCommand(id: string): string {
	return `python scripts/read_covenant.py --id ${shellQuote(id)}`;
}
