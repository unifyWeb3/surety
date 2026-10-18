/**
 * The commands this page composes.
 *
 * This app holds no key and signs nothing, so the honest thing for a compose page to hand over is
 * the exact transaction: the arguments, the id the contract will derive, and the command that
 * sends it. The commands are the repository's own scripts, so the text on this page is the text
 * that was actually run against the live contract.
 */

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

export function activateCommand(id: string): string {
	return `python scripts/activate_covenant.py --id ${shellQuote(id)}`;
}

export function checkCommand(id: string): string {
	return `python scripts/request_check.py --id ${shellQuote(id)}`;
}

export function readCommand(id: string): string {
	return `python scripts/read_covenant.py --id ${shellQuote(id)}`;
}
