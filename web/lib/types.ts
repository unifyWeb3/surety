/**
 * The shape of a covenant as the contract returns it.
 *
 * Field names are the contract's own. Statuses and verdicts are string unions so the UI can be
 * exhaustive about them instead of falling back to a generic badge.
 */

import { isCovenantStatus, type CovenantStatus } from "./status";

export type { CovenantStatus };

export type Verdict = "NONE" | "NO_BREACH" | "BREACH" | "PROMISE_ABSENT" | "UNREACHABLE";

export type CoverageBand = "" | "COVERAGE_EXACT" | "COVERAGE_GE_0_90" | "COVERAGE_LT_0_90";

export type Match = "" | "VERBATIM" | "EQUIVALENT";

export type Covenant = {
	covenant_id: string;
	owner: string;
	label: string;
	source_url: string;
	subject: string;
	promise_text: string;
	breach_rule: string;
	permitted_changes: string;
	beneficiary: string;
	beneficiary_is_owner: boolean;
	bond_declared_atto: string;
	bond_sent_atto: string;
	absence_is_breach: boolean;
	check_cooldown_seconds: string;
	created_at: string;
	status: CovenantStatus;
	is_active: boolean;
	is_breached: boolean;
	anchor_quote: string;
	anchor_digest: string;
	anchor_text_digest: string;
	anchor_match: Match;
	anchor_coverage_band: CoverageBand;
	activated_at: string;
	activation_by: string;
	last_check_seq: string;
	last_check_at: string;
	last_check_by: string;
	last_check_verdict: Verdict;
	last_check_quote_present: boolean;
	last_check_anchor_drifted: boolean;
	last_check_evidence_digest: string;
	last_check_text_digest: string;
	last_check_rule_span: string;
	breached_at: string;
};

export type RawStats = {
	covenants?: unknown;
	breaches?: unknown;
	activation_refusals?: unknown;
	checks?: unknown;
	min_cooldown_seconds?: unknown;
	max_cooldown_seconds?: unknown;
	list_scan_cap?: unknown;
	list_results_cap?: unknown;
	network_value?: unknown;
};

export type Stats = {
	covenants: number;
	breaches: number;
	activationRefusals: number;
	checks: number;
	minCooldownSeconds: number;
	maxCooldownSeconds: number;
	listScanCap: number;
	listResultsCap: number;
	networkValue: string;
};

const VERDICTS: Verdict[] = ["NONE", "NO_BREACH", "BREACH", "PROMISE_ABSENT", "UNREACHABLE"];
function text(value: unknown, field: string): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) {
		throw new Error(`missing field ${field}`);
	}
	if (typeof value === "number" || typeof value === "bigint") return String(value);
	throw new Error(`field ${field} was ${typeof value}, not text`);
}

function yes(value: unknown): boolean {
	return value === true;
}

/**
 * Build a typed covenant, and refuse to invent one.
 *
 * An unknown status throws rather than being displayed as "unknown", because a register that
 * cannot name a status must not show the row as if it had understood it.
 */
export function toCovenant(raw: Record<string, unknown>): Covenant {
	const status = text(raw.status, "status");
	if (!isCovenantStatus(status)) {
		throw new Error(`unrecognised status "${status}"`);
	}
	const verdict = text(raw.last_check_verdict ?? "NONE", "last_check_verdict") as Verdict;
	if (!VERDICTS.includes(verdict)) {
		throw new Error(`unrecognised verdict "${verdict}"`);
	}
	return {
		covenant_id: text(raw.covenant_id, "covenant_id"),
		owner: text(raw.owner, "owner"),
		label: text(raw.label, "label"),
		source_url: text(raw.source_url, "source_url"),
		subject: text(raw.subject, "subject"),
		promise_text: text(raw.promise_text, "promise_text"),
		breach_rule: text(raw.breach_rule, "breach_rule"),
		permitted_changes: text(raw.permitted_changes, "permitted_changes"),
		beneficiary: text(raw.beneficiary, "beneficiary"),
		beneficiary_is_owner: yes(raw.beneficiary_is_owner),
		bond_declared_atto: text(raw.bond_declared_atto ?? "0", "bond_declared_atto"),
		bond_sent_atto: text(raw.bond_sent_atto ?? "0", "bond_sent_atto"),
		absence_is_breach: yes(raw.absence_is_breach),
		check_cooldown_seconds: text(raw.check_cooldown_seconds, "check_cooldown_seconds"),
		created_at: text(raw.created_at, "created_at"),
		status,
		is_active: yes(raw.is_active),
		is_breached: yes(raw.is_breached),
		anchor_quote: text(raw.anchor_quote ?? "", "anchor_quote"),
		anchor_digest: text(raw.anchor_digest ?? "", "anchor_digest"),
		anchor_text_digest: text(raw.anchor_text_digest ?? "", "anchor_text_digest"),
		anchor_match: text(raw.anchor_match ?? "", "anchor_match") as Match,
		anchor_coverage_band: text(raw.anchor_coverage_band ?? "", "anchor_coverage_band") as CoverageBand,
		activated_at: text(raw.activated_at ?? "", "activated_at"),
		activation_by: text(raw.activation_by ?? "", "activation_by"),
		last_check_seq: text(raw.last_check_seq ?? "0", "last_check_seq"),
		last_check_at: text(raw.last_check_at ?? "", "last_check_at"),
		last_check_by: text(raw.last_check_by ?? "", "last_check_by"),
		last_check_verdict: verdict,
		last_check_quote_present: yes(raw.last_check_quote_present),
		last_check_anchor_drifted: yes(raw.last_check_anchor_drifted),
		last_check_evidence_digest: text(raw.last_check_evidence_digest ?? "", "last_check_evidence_digest"),
		last_check_text_digest: text(raw.last_check_text_digest ?? "", "last_check_text_digest"),
		last_check_rule_span: text(raw.last_check_rule_span ?? "", "last_check_rule_span"),
		breached_at: text(raw.breached_at ?? "", "breached_at"),
	};
}
