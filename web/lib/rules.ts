/**
 * A mirror of the contract's creation checks, so the composer can tell a reader what is wrong
 * before they sign anything.
 *
 * The contract is the authority. This file exists to move a refusal forward in time, never to
 * decide anything: if the two ever disagree the transaction is the one that matters, and the UI
 * says so on the page rather than implying that a green tick here is a guarantee. The limits,
 * literals and messages below are copied from `contracts/surety.py` on purpose — a mirror that
 * paraphrases is a mirror that drifts.
 */

export const LIMITS = {
	labelMin: 3,
	labelMax: 64,
	subjectMin: 3,
	subjectMax: 64,
	promiseMin: 8,
	promiseMax: 400,
	permittedMax: 1000,
	ruleArgumentMax: 200,
	semanticRuleMax: 600,
	urlMax: 400,
	cooldownMin: 60,
	cooldownMax: 2_592_000,
} as const;

const LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,63}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ATTO = /^[0-9]{1,50}$/;
// C0/C1 controls except tab, LF and CR (which normalization folds), plus bidi and zero-width
// formatting characters. Same set as the contract's _CONTROL_RE.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

export type FieldCheck = { ok: true; value: string } | { ok: false; problem: string };

export function normalize(value: string): string {
	return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function plain(value: string, what: string): FieldCheck {
	if (CONTROL.test(value)) {
		return {
			ok: false,
			problem: `${what} contains a control or direction-override character. Those exist to make one string display as another, so the contract refuses them.`,
		};
	}
	return { ok: true, value };
}

export function checkLabel(input: string): FieldCheck {
	const value = normalize(input);
	if (CONTROL.test(value)) {
		return { ok: false, problem: "A label cannot contain control characters." };
	}
	if (!LABEL.test(value)) {
		return {
			ok: false,
			problem: `3 to 64 characters, starting with a letter or digit, using letters, digits, spaces, dot, dash or underscore. This is your own handle for the covenant, and it must be unique among your covenants.`,
		};
	}
	return { ok: true, value };
}

export function checkSourceUrl(input: string): FieldCheck {
	const value = input.trim();
	if (value.length < 9 || value.length > LIMITS.urlMax) {
		return { ok: false, problem: `A source URL must be ${LIMITS.urlMax} characters or fewer.` };
	}
	if (!value.startsWith("https://")) {
		return { ok: false, problem: "Only https sources are accepted. The contract refuses http." };
	}
	if (/\s/.test(value)) {
		return { ok: false, problem: "A URL cannot contain whitespace." };
	}
	const control = plain(value, "The URL");
	if (!control.ok) return control;
	if (value.includes("#")) {
		return { ok: false, problem: "Drop the fragment: a URL is pinned without it." };
	}
	const authority = value.slice(8).split("/", 1)[0];
	if (authority.includes("@")) {
		return { ok: false, problem: "A URL cannot carry userinfo before the host." };
	}
	const host = authority.split(":", 1)[0].trim().toLowerCase();
	if (host === "" || !host.includes(".")) {
		return { ok: false, problem: "The host must be a dotted domain name." };
	}
	if (/^[0-9.]+$/.test(host)) {
		return { ok: false, problem: "The host must not be an IP address." };
	}
	if (!/^[a-z0-9.-]+$/.test(host)) {
		return { ok: false, problem: "The host contains characters the contract does not accept." };
	}
	return { ok: true, value };
}

export function checkSubject(input: string): FieldCheck {
	const value = normalize(input);
	const control = plain(value, "The subject");
	if (!control.ok) return control;
	if (value.length < LIMITS.subjectMin || value.length > LIMITS.subjectMax) {
		return {
			ok: false,
			problem: `${LIMITS.subjectMin} to ${LIMITS.subjectMax} characters. The subject must also appear inside the cited window for activation to be possible.`,
		};
	}
	return { ok: true, value };
}

export function checkPromise(input: string): FieldCheck {
	const value = normalize(input);
	const control = plain(value, "The promise");
	if (!control.ok) return control;
	if (value.length < LIMITS.promiseMin || value.length > LIMITS.promiseMax) {
		return { ok: false, problem: `${LIMITS.promiseMin} to ${LIMITS.promiseMax} characters.` };
	}
	const alphanumeric = [...value].filter((character) => /[a-z0-9]/i.test(character)).length;
	if (alphanumeric < 4) {
		return { ok: false, problem: "A promise needs some actual words in it." };
	}
	return { ok: true, value };
}

export type RuleShape = {
	kind: "literal-absent" | "literal-present" | "semantic";
	argument: string;
	needsModel: boolean;
};

export function checkRule(input: string): { ok: true; value: string; shape: RuleShape } | { ok: false; problem: string } {
	const value = normalize(input);
	const control = plain(value, "The breach rule");
	if (!control.ok) return control;

	for (const kind of ["literal-absent", "literal-present"] as const) {
		const prefix = `${kind}:`;
		if (value.startsWith(prefix)) {
			const argument = normalize(value.slice(prefix.length));
			if (argument === "" || argument.length > LIMITS.ruleArgumentMax) {
				return {
					ok: false,
					problem: `A literal rule needs 1 to ${LIMITS.ruleArgumentMax} characters after the colon.`,
				};
			}
			return { ok: true, value, shape: { kind, argument, needsModel: false } };
		}
	}

	if (value.startsWith("semantic:")) {
		const argument = normalize(value.slice("semantic:".length));
		if (argument.length < 8 || argument.length > LIMITS.semanticRuleMax) {
			return { ok: false, problem: `A semantic rule needs 8 to ${LIMITS.semanticRuleMax} characters.` };
		}
		return { ok: true, value, shape: { kind: "semantic", argument, needsModel: true } };
	}

	return {
		ok: false,
		problem:
			"The rule language is closed. Start with literal-absent: (a breach is the text disappearing), literal-present: (a breach is the text appearing) or semantic: (a sentence a model votes on). A literal match ignores case, so you do not need to match the page's capitalisation.",
	};
}

export function checkPermittedChanges(input: string): FieldCheck {
	const value = normalize(input);
	const control = plain(value, "Permitted changes");
	if (!control.ok) return control;
	if (value.length > LIMITS.permittedMax) {
		return { ok: false, problem: `At most ${LIMITS.permittedMax} characters.` };
	}
	return { ok: true, value };
}

export function checkAddress(input: string, what: string): FieldCheck {
	const value = input.trim();
	if (!ADDRESS.test(value)) {
		return { ok: false, problem: `${what} must be 0x followed by 40 hex characters.` };
	}
	return { ok: true, value: value.toLowerCase() };
}

export function checkAtto(input: string): FieldCheck {
	const value = input.trim();
	if (!ATTO.test(value)) {
		return {
			ok: false,
			problem: "A bond is a whole number of atto-GEN, written as digits with no exponent or separator.",
		};
	}
	return { ok: true, value };
}

export function checkCooldown(input: string): { ok: true; value: number } | { ok: false; problem: string } {
	const value = input.trim();
	if (!/^[0-9]{1,20}$/.test(value)) {
		return { ok: false, problem: "The cooldown is a whole number of seconds." };
	}
	const seconds = Number(value);
	if (!Number.isSafeInteger(seconds) || seconds < LIMITS.cooldownMin || seconds > LIMITS.cooldownMax) {
		return {
			ok: false,
			problem: `Between ${LIMITS.cooldownMin} seconds and 30 days (${LIMITS.cooldownMax} seconds). This is the one parameter that limits how often a stranger may re-check you, so the contract will not accept a smaller one.`,
		};
	}
	return { ok: true, value: seconds };
}

/**
 * The covenant id the contract will derive: sha256(sender + "|" + label).
 *
 * Computed here only as a preview. The contract derives it from the transaction sender, so this
 * figure is right exactly when the address above is the account that signs.
 */
export async function previewId(owner: string, label: string): Promise<string> {
	const bytes = new TextEncoder().encode(`${owner.toLowerCase()}|${normalize(label)}`);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
