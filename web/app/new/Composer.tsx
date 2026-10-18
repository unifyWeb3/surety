"use client";

/**
 * The composer.
 *
 * It composes and it validates; it does not sign, and it says so. The output is the exact
 * transaction: the arguments, the id the contract will derive, and the command this repository
 * actually ran against the live contract. The covenant id preview is a client-side sha256 of the
 * same preimage the contract uses, so it is right exactly when the address typed above is the
 * account that signs — which the page states rather than assumes.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy } from "@/components/Copy";
import { createCommand } from "@/lib/commands";
import {
	LIMITS,
	checkAddress,
	checkAtto,
	checkCooldown,
	checkLabel,
	checkPermittedChanges,
	checkPromise,
	checkRule,
	checkSourceUrl,
	checkSubject,
	previewId,
} from "@/lib/rules";

const EMPTY = {
	owner: "",
	label: "",
	sourceUrl: "",
	subject: "",
	promise: "",
	rule: "",
	permitted: "",
	beneficiary: "",
	bond: "0",
	absenceIsBreach: true,
	cooldown: "3600",
};

const EXAMPLE = {
	owner: "",
	label: "acme-fee-moratorium",
	sourceUrl: "https://gist.githubusercontent.com/unifyWeb3/PLACEHOLDER/raw/terms.md",
	subject: "Acme Protocol",
	promise:
		"Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2030-12-31",
	rule: "literal-present:Acme Protocol may increase the base transfer fee at any time",
	permitted: "documentation formatting, wording and navigation",
	beneficiary: "0x0000000000000000000000000000000000000000",
	bond: "1000000000000000000",
	absenceIsBreach: true,
	cooldown: "60",
};

type Term = keyof typeof EMPTY;

function Field({
	term,
	label,
	hint,
	value,
	problem,
	onChange,
	multiline = false,
	placeholder,
}: {
	term: Term;
	label: string;
	hint: string;
	value: string;
	problem: string | null;
	onChange: (value: string) => void;
	multiline?: boolean;
	placeholder?: string;
}) {
	const id = `field-${term}`;
	const describedBy = `${id}-hint${problem ? ` ${id}-error` : ""}`;
	return (
		<div className={`field${problem ? " bad" : ""}`}>
			<label htmlFor={id}>{label}</label>
			{multiline ? (
				<textarea
					id={id}
					name={term}
					value={value}
					placeholder={placeholder}
					spellCheck={false}
					aria-describedby={describedBy}
					aria-invalid={problem ? true : undefined}
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<input
					id={id}
					name={term}
					type="text"
					value={value}
					placeholder={placeholder}
					spellCheck={false}
					autoComplete="off"
					aria-describedby={describedBy}
					aria-invalid={problem ? true : undefined}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
			<p className="hint" id={`${id}-hint`}>
				{hint}
			</p>
			{problem ? (
				<p className="error" id={`${id}-error`}>
					{problem}
				</p>
			) : null}
		</div>
	);
}

type Check<T> = { ok: true; value: T } | { ok: false; problem: string };

/** Only complain once the reader has typed something into the field. */
function problemOf<T>(touched: boolean, result: Check<T>): string | null {
	if (!touched || result.ok) return null;
	return result.problem;
}

export function Composer() {
	const [terms, setTerms] = useState({ ...EMPTY });
	const [touched, setTouched] = useState<Partial<Record<Term, boolean>>>({});
	const [id, setId] = useState("");
	const [contractSays, setContractSays] = useState<
		null | { state: "asking" } | { state: "answer"; valid: boolean; kind: string; needsModel: boolean; argument: string } | { state: "error"; error: string }
	>(null);

	const set = (term: Term) => (value: string) => {
		setTerms((current) => ({ ...current, [term]: value }));
		setTouched((current) => ({ ...current, [term]: true }));
	};

	const checks = useMemo(() => {
		const ownerCheck = checkAddress(terms.owner, "The signing address");
		const labelCheck = checkLabel(terms.label);
		const urlCheck = checkSourceUrl(terms.sourceUrl);
		const subjectCheck = checkSubject(terms.subject);
		const promiseCheck = checkPromise(terms.promise);
		const ruleCheck = checkRule(terms.rule);
		const permittedCheck = checkPermittedChanges(terms.permitted);
		const beneficiaryCheck = checkAddress(terms.beneficiary, "The beneficiary");
		const bondCheck = checkAtto(terms.bond);
		const cooldownCheck = checkCooldown(terms.cooldown);
		return {
			owner: ownerCheck,
			label: labelCheck,
			sourceUrl: urlCheck,
			subject: subjectCheck,
			promise: promiseCheck,
			rule: ruleCheck,
			permitted: permittedCheck,
			beneficiary: beneficiaryCheck,
			bond: bondCheck,
			cooldown: cooldownCheck,
		};
	}, [terms]);

	// The id is derived, never invented: same preimage, same digest as the contract.
	useEffect(() => {
		let live = true;
		if (!checks.owner.ok || !checks.label.ok) {
			setId("");
			return () => {
				live = false;
			};
		}
		previewId(checks.owner.value, checks.label.value).then((value) => {
			if (live) setId(value);
		});
		return () => {
			live = false;
		};
	}, [checks.owner, checks.label]);

	const allGood =
		checks.owner.ok &&
		checks.label.ok &&
		checks.sourceUrl.ok &&
		checks.subject.ok &&
		checks.promise.ok &&
		checks.rule.ok &&
		checks.permitted.ok &&
		checks.beneficiary.ok &&
		checks.bond.ok &&
		checks.cooldown.ok;

	const command = allGood
		? createCommand({
				label: checks.label.ok ? checks.label.value : terms.label,
				sourceUrl: checks.sourceUrl.ok ? checks.sourceUrl.value : terms.sourceUrl,
				subject: checks.subject.ok ? checks.subject.value : terms.subject,
				promise: checks.promise.ok ? checks.promise.value : terms.promise,
				rule: checks.rule.ok ? checks.rule.value : terms.rule,
				permitted: checks.permitted.ok ? checks.permitted.value : terms.permitted,
				beneficiary: checks.beneficiary.ok ? checks.beneficiary.value : terms.beneficiary,
				bond: checks.bond.ok ? checks.bond.value : terms.bond,
				absenceIsBreach: terms.absenceIsBreach,
				cooldown: terms.cooldown.trim(),
			})
		: "";

	async function askContract() {
		if (!checks.rule.ok) return;
		setContractSays({ state: "asking" });
		try {
			const response = await fetch("/api/rule", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ rule: checks.rule.value }),
			});
			const body = (await response.json()) as
				| { ok: true; shape: { valid: boolean; kind: string; argument: string; needs_model: boolean } }
				| { ok: false; error: string };
			if (!body.ok) {
				setContractSays({ state: "error", error: body.error });
				return;
			}
			setContractSays({
				state: "answer",
				valid: body.shape.valid,
				kind: body.shape.kind,
				argument: body.shape.argument,
				needsModel: body.shape.needs_model,
			});
		} catch (error) {
			setContractSays({
				state: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return (
		<div className="split">
			<form
				onSubmit={(event) => event.preventDefault()}
				aria-label="Covenant terms"
			>
				<fieldset>
					<legend>Who and where</legend>

					<Field
						term="owner"
						label="Address that will sign"
						hint="Used only to preview the covenant id and to check that the address is well formed. This page never sees a key, and the run of the id belongs to whoever actually sends the transaction."
						value={terms.owner}
						problem={problemOf(Boolean(touched.owner), checks.owner)}
						onChange={set("owner")}
						placeholder="0x…"
					/>

					<Field
						term="label"
						label="Label — your handle for it"
						hint={`${LIMITS.labelMin}–${LIMITS.labelMax} characters. Unique among your own covenants, and part of the id, so two owners may use the same label safely.`}
						value={terms.label}
						problem={problemOf(Boolean(touched.label), checks.label)}
						onChange={set("label")}
						placeholder="acme-fee-moratorium"
					/>

					<Field
						term="sourceUrl"
						label="Pinned source"
						hint="One https URL. No fragments, no userinfo, no IP hosts. This becomes a permanent part of the covenant: no method accepts a URL afterwards."
						value={terms.sourceUrl}
						problem={problemOf(Boolean(touched.sourceUrl), checks.sourceUrl)}
						onChange={set("sourceUrl")}
						placeholder="https://example.com/terms"
					/>

					<Field
						term="subject"
						label="Subject"
						hint="Who or what is making the promise. It must appear inside the cited window, or activation cannot succeed — that is what stops “these words are somewhere on this page” from counting."
						value={terms.subject}
						problem={problemOf(Boolean(touched.subject), checks.subject)}
						onChange={set("subject")}
						placeholder="Acme Protocol"
					/>
				</fieldset>

				<fieldset>
					<legend>The promise and the rule</legend>

					<Field
						term="promise"
						label="Promise, word for word"
						hint="Copy it from the source exactly. Activation is refused unless validators find it — verbatim, or as a window carrying at least 90% of these words with the subject inside it."
						value={terms.promise}
						problem={problemOf(Boolean(touched.promise), checks.promise)}
						onChange={set("promise")}
						multiline
					/>

					<Field
						term="rule"
						label="Rule that counts as breaking it"
						hint="literal-absent:TEXT — a breach is TEXT leaving the page. literal-present:TEXT — a breach is TEXT appearing. semantic:SENTENCE — a model votes on your sentence, and must cite a span it can prove. Literal rules ask no model at all."
						value={terms.rule}
						problem={problemOf(Boolean(touched.rule), checks.rule)}
						onChange={set("rule")}
						multiline
						placeholder="literal-present:Acme Protocol may increase the base transfer fee at any time"
					/>

					<div className="actions" style={{ marginBottom: "1.75rem" }}>
						<button
							type="button"
							className="ghost"
							onClick={askContract}
							disabled={!checks.rule.ok || contractSays?.state === "asking"}
						>
							{contractSays?.state === "asking" ? "Asking the contract…" : "Ask the contract to read this rule"}
						</button>
						{contractSays?.state === "answer" ? (
							contractSays.valid ? (
								<span className="mono small" style={{ color: "var(--active)" }}>
									contract says: valid {contractSays.kind}
									{contractSays.needsModel ? " · needs a model vote" : " · no model is asked"}
								</span>
							) : (
								<span className="mono small" style={{ color: "var(--breached)" }}>
									contract says: not a rule it accepts
								</span>
							)
						) : null}
						{contractSays?.state === "error" ? (
							<span className="mono small break" style={{ color: "var(--breached)" }}>
								{contractSays.error}
							</span>
						) : null}
					</div>

					<Field
						term="permitted"
						label="Permitted changes"
						hint="Changes that are never a breach. Given to the model on a semantic rule; recorded but unused on a literal rule, because no model is asked."
						value={terms.permitted}
						problem={problemOf(Boolean(touched.permitted), checks.permitted)}
						onChange={set("permitted")}
					/>
				</fieldset>

				<fieldset>
					<legend>Bond, beneficiary, pacing</legend>

					<Field
						term="beneficiary"
						label="Beneficiary"
						hint="Recorded as your own declaration. They are not asked, not notified, and receive nothing: this contract has no payout method."
						value={terms.beneficiary}
						problem={problemOf(Boolean(touched.beneficiary), checks.beneficiary)}
						onChange={set("beneficiary")}
						placeholder="0x…"
					/>

					<Field
						term="bond"
						label="Bond, in atto-GEN"
						hint="A whole number as digits. This is the figure the record shows as declared; the contract separately records what the transaction actually carried. No value moves in either case."
						value={terms.bond}
						problem={problemOf(Boolean(touched.bond), checks.bond)}
						onChange={set("bond")}
					/>

					<Field
						term="cooldown"
						label="Cooldown between checks, in seconds"
						hint={`${LIMITS.cooldownMin} to ${LIMITS.cooldownMax} (30 days). The contract floors this at ${LIMITS.cooldownMin} seconds and will refuse a smaller one — it is the only thing limiting a stranger's re-checks.`}
						value={terms.cooldown}
						problem={problemOf(Boolean(touched.cooldown), checks.cooldown)}
						onChange={set("cooldown")}
					/>

					<div className="field">
						<div className="choice">
							<input
								id="absence"
								type="checkbox"
								checked={terms.absenceIsBreach}
								onChange={(event) => {
									setTerms((current) => ({ ...current, absenceIsBreach: event.target.checked }));
									setTouched((current) => ({ ...current, absenceIsBreach: true }));
								}}
							/>
							<label htmlFor="absence">
								Count a vanished promise as a breach.
								<p className="hint">
									With this on, a check that cannot find the promise records BREACH — so
									deleting the page is not an escape. With it off, the check records
									PROMISE_ABSENT and the covenant stays active, and the record says you
									chose that.
								</p>
							</label>
						</div>
					</div>
				</fieldset>
			</form>

			<div className="stack">
				<div className="payload">
					<header>
						<span className="caption">Covenant id the contract will derive</span>
						<Copy value={id} label="the covenant id" />
					</header>
					<pre>{id === "" ? "sha256(signing address + \"|\" + label) — fill in an address and a label" : id}</pre>
				</div>

				<div className="payload">
					<header>
						<span className="caption">The transaction, ready to send</span>
						{command === "" ? null : <Copy value={command} label="the create command" />}
					</header>
					<pre>
						{command === ""
							? "Nothing to send yet: some term above is still missing or malformed. The payload appears only once every field would pass the contract's own checks."
							: command}
					</pre>
				</div>

				<div className="notice notice-quiet">
					<p className="kicker">This page signs nothing</p>
					<p>
						It holds no key and cannot submit. That is deliberate: a key in a web page is a key
						you do not control, and a hosted page should not be able to move your bond. Send the
						command above with your own account and the covenant id will match — the id is
						derived from the sender, so nobody else can produce a covenant under your address.
					</p>
					<p className="dim small">
						The checks on this page are a mirror of the contract&rsquo;s own, kept so you find out
						early rather than paying to be told. The contract is the authority; if the two ever
						disagree, the contract wins and the transaction fails.
					</p>
				</div>

				<div className="actions">
					<button type="button" className="ghost" onClick={() => { setTerms({ ...EMPTY, owner: terms.owner }); setTouched({}); setContractSays(null); setId(""); }}>
						Start empty
					</button>
					<button
						type="button"
						className="ghost"
						onClick={() => {
							setTerms({ ...EXAMPLE, owner: terms.owner });
							setTouched({});
							setContractSays(null);
						}}
					>
						Fill with a worked example
					</button>
				</div>

				<p className="dim small">
					The example is a real configuration: a source that says the fee stays at 0.10 percent,
					and a rule that fires the moment the source says otherwise. It is the shape of covenant
					this protocol was built for.
				</p>
			</div>
		</div>
	);
}
