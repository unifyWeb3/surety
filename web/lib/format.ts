/**
 * Presentation helpers. Everything here is lossless in one direction: it never turns an unknown
 * or an empty value into a zero, a date, or a friendly word.
 */

import type { CovenantStatus, Verdict } from "./types";

/** "0x9f3c…41ab" — enough to recognise, never enough to mistake for the whole value. */
export function shortHex(value: string, lead = 6, tail = 4): string {
	if (value.length <= lead + tail + 2) return value;
	return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function shortDigest(digest: string): string {
	if (digest === "") return "none recorded";
	return `sha256:${shortHex(digest, 10, 6)}`;
}

/** An ISO instant is shown as the instant. Empty means this never happened, not "long ago". */
export function stamp(iso: string): string {
	if (iso === "") return "—";
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) return iso;
	return parsed.toISOString().replace(".000Z", "Z");
}

/** atto-GEN as a decimal GEN figure, with the atto value kept visible beside it. */
export function atto(value: string): { gen: string; atto: string } {
	if (!/^\d+$/.test(value)) return { gen: "not a number", atto: value };
	const padded = value.padStart(19, "0");
	const whole = padded.slice(0, -18).replace(/^0+(?=\d)/, "");
	const fraction = padded.slice(-18).replace(/0+$/, "");
	return {
		gen: fraction === "" ? whole : `${whole}.${fraction}`,
		atto: value,
	};
}

export type Tone = "awaiting" | "active" | "refused" | "breached" | "plain";

/**
 * The tone of a status seal.
 *
 * A record, not a switch, so adding a status to the contract's list makes this a compile
 * error until the new status is given a tone. A switch would silently fall through.
 */
const TONE_OF: Record<CovenantStatus, Tone> = {
	ACTIVE: "active",
	BREACHED: "breached",
	AWAITING_ACTIVATION: "awaiting",
	REFUSED_PROMISE_ABSENT: "refused",
	REFUSED_SUBJECT_ABSENT: "refused",
	REFUSED_ALREADY_IN_BREACH: "refused",
	REFUSED_SOURCE_UNREACHABLE: "refused",
};

export function toneOf(status: CovenantStatus): Tone {
	return TONE_OF[status] ?? "plain";
}

export function verdictTone(verdict: Verdict): Tone {
	switch (verdict) {
		case "BREACH":
			return "breached";
		case "NO_BREACH":
			return "active";
		case "NONE":
			return "plain";
		case "UNREACHABLE":
			return "refused";
		case "PROMISE_ABSENT":
			return "awaiting";
	}
}

/** One plain sentence per verdict, so a reader never has to decode an enum. */
export function verdictSentence(verdict: Verdict): string {
	switch (verdict) {
		case "NONE":
			return "No check has been run on this covenant yet.";
		case "NO_BREACH":
			return "The last check found the promise present and the rule intact.";
		case "BREACH":
			return "The last check found the owner's rule broken.";
		case "PROMISE_ABSENT":
			return "The last check could not find the promise in the source.";
		case "UNREACHABLE":
			return "The last check could not read the source. No verdict was reached.";
	}
}

export function ruleKind(rule: string): string {
	if (rule.startsWith("literal-absent:")) return "literal-absent";
	if (rule.startsWith("literal-present:")) return "literal-present";
	if (rule.startsWith("semantic:")) return "semantic";
	return "unrecognised";
}

export function ruleArgument(rule: string): string {
	const cut = rule.indexOf(":");
	return cut === -1 ? rule : rule.slice(cut + 1).trim();
}

/** What a literal rule means in words. A semantic rule is the owner's own sentence. */
export function ruleSentence(rule: string): string {
	const kind = ruleKind(rule);
	const argument = ruleArgument(rule);
	if (kind === "literal-absent") {
		return `A breach is a source that no longer contains this text: “${argument}”.`;
	}
	if (kind === "literal-present") {
		return `A breach is a source where this text has appeared: “${argument}”.`;
	}
	if (kind === "semantic") {
		return `A breach is decided by model vote on the owner's own sentence: “${argument}”.`;
	}
	return "This rule's form is not recognised by the page, so it is shown raw and nothing is inferred from it.";
}

export function coverageSentence(band: string): string {
	switch (band) {
		case "COVERAGE_EXACT":
			return "verbatim: the promise appears in the source exactly as written";
		case "COVERAGE_GE_0_90":
			return "equivalent: at least 90% of the promise's words appear in the cited window, with the subject named";
		case "":
			return "no coverage was recorded";
		default:
			return band;
	}
}
