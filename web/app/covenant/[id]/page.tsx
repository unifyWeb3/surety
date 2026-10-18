import Link from "next/link";
import { Chain } from "@/components/Chain";
import { Copy } from "@/components/Copy";
import { Notice, ReadFailure } from "@/components/Notice";
import { Stamp, VerdictStamp } from "@/components/Stamp";
import { readCovenant } from "@/lib/chain";
import { activateCommand, checkCommand, readCommand } from "@/lib/commands";
import { loadConfig } from "@/lib/config";
import {
	atto,
	coverageSentence,
	ruleKind,
	ruleSentence,
	shortHex,
	stamp,
	statusSentence,
	verdictSentence,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CovenantPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const config = loadConfig();

	if (!config.ok) {
		return (
			<Notice kind="config" kicker="chain configuration" title="No chain to read, so nothing is shown">
				<p>{config.problem}</p>
			</Notice>
		);
	}

	const result = await readCovenant(id);
	if (!result.ok) {
		return (
			<div className="stack">
				<ReadFailure title={`Covenant ${shortHex(id, 10, 6)} could not be read`} error={result.error} />
				<Link href="/ledger" className="mono small">
					← back to the register
				</Link>
			</div>
		);
	}

	const c = result.value;
	const bond = atto(c.bond_declared_atto);
	const received = atto(c.bond_sent_atto);
	const verdictChangedByAbsence =
		c.status === "BREACHED" && c.last_check_verdict === "BREACH" && !c.last_check_quote_present;

	return (
		<>
			<section>
				<p className="eyebrow">
					Covenant · {c.label} · <span className="break">{c.covenant_id}</span>
				</p>
				<div className="pill-row" style={{ marginBottom: "1rem" }}>
					<Stamp status={c.status} size="lg" />
					<span className="mono small dim">
						written {stamp(c.created_at)} by {c.owner}
					</span>
				</div>
				<h1>{c.subject} promises</h1>
				<blockquote
					style={{
						margin: "1.25rem 0 0",
						paddingLeft: "1.15rem",
						borderLeft: "3px solid var(--ink)",
						fontSize: "1.35rem",
						lineHeight: 1.4,
						maxWidth: "52ch",
					}}
				>
					{c.promise_text}
				</blockquote>
				<p className="dim" style={{ marginTop: "1.25rem" }}>
					{statusSentence(c.status)}
				</p>
			</section>

			<section className="section">
				<h2>The terms, as written and never edited</h2>
				<dl className="deflist">
					<dt>Pinned source</dt>
					<dd>
						<a href={c.source_url} rel="noreferrer noopener nofollow" target="_blank" className="mono break">
							{c.source_url}
						</a>
						<p className="hint">
							Fixed when this covenant was written. No method in the contract accepts a URL
							afterwards, so this cannot be repointed.
						</p>
					</dd>

					<dt>Rule for a breach</dt>
					<dd className="serif">
						{ruleSentence(c.breach_rule)}
						{c.breach_rule.startsWith("literal-") ? (
							<p className="hint">
								This is a literal rule, so no model is asked anything. Whether the text is in
								the page is decided by string comparison against each validator&rsquo;s own
								fetch.
							</p>
						) : ruleKind(c.breach_rule) === "semantic" ? (
							<p className="hint">
								Model vote, on the owner&rsquo;s sentence, over the cited window only. Any
								breach it reports must come with a span that is verbatim in the
								validator&rsquo;s own bytes, or the check fails instead of storing.
							</p>
						) : (
							<p className="hint">
								This page does not recognise the form of that rule and infers nothing from
								it.
							</p>
						)}
					</dd>

					<dt>Permitted changes</dt>
					<dd className="serif">
						{c.permitted_changes === "" ? (
							<span className="dim">None declared. Any change is a change.</span>
						) : (
							c.permitted_changes
						)}
						<p className="hint">
							Context for the model on a semantic rule. On a literal rule it is recorded but
							not used, because no model is asked.
						</p>
					</dd>

					<dt>If the promise vanishes</dt>
					<dd className="serif">
						{c.absence_is_breach ? (
							<>
								<strong>Counts as a breach.</strong> If the promise can no longer be found in
								the source, a check records BREACH — so deleting the promise is not a way out.
							</>
						) : (
							<>
								<strong>Does not count as a breach.</strong> If the promise can no longer be
								found, the check records PROMISE_ABSENT and the covenant stays ACTIVE. The
								owner chose this, and the record shows they did.
							</>
						)}
					</dd>

					<dt>Beneficiary</dt>
					<dd className="mono break">
						{c.beneficiary}
						{c.beneficiary_is_owner ? (
							<span className="dim"> — the owner named themselves</span>
						) : null}
						<p className="hint">
							The owner&rsquo;s own declaration. The beneficiary was not asked, is not
							notified, and receives nothing: there is no payout path in this contract.
						</p>
					</dd>

					<dt>Cooldown</dt>
					<dd className="mono">
						{c.check_cooldown_seconds} seconds between checks
						<p className="hint">
							The only thing limiting a stranger&rsquo;s re-checks. Enforced in the contract,
							floored at 60 seconds.
						</p>
					</dd>
				</dl>
			</section>

			<section className="section">
				<h2>What the validators proved, and when</h2>
				<Chain
					url={c.source_url}
					quote={c.anchor_quote}
					digest={c.anchor_digest}
					pageDigest={c.anchor_text_digest}
					empty={
						c.status === "AWAITING_ACTIVATION" ? (
							<p className="dim">
								Nothing has been cited yet because activation has not run. Until it does,
								this covenant watches nothing. Any address may run it:
								<code className="mono small break" style={{ display: "block", marginTop: 8 }}>
									{activateCommand(c.covenant_id)}
								</code>
							</p>
						) : (
							<p className="dim">
								Nothing was cited, because nothing was proven. An activation refusal stores no
								quote and no digest — a refusal is not evidence, and this contract does not
								pretend otherwise. Retrying activation is allowed and costs nothing:
								<code className="mono small break" style={{ display: "block", marginTop: 8 }}>
									{activateCommand(c.covenant_id)}
								</code>
							</p>
						)
					}
				/>
				{c.anchor_digest !== "" ? (
					<dl className="deflist" style={{ marginTop: "1.75rem" }}>
						<dt>Match</dt>
						<dd className="serif">
							{coverageSentence(c.anchor_coverage_band)}
							<span className="mono"> · {c.anchor_match}</span>
						</dd>
						<dt>Proved at</dt>
						<dd className="mono">{stamp(c.activated_at)}</dd>
						<dt>Triggered by</dt>
						<dd className="mono break">
							{c.activation_by}
							<p className="hint">
								Activation is permissionless by design, so this address may be anyone. It
								could not have changed the terms: it supplied no URL, no quote and no verdict.
							</p>
						</dd>
					</dl>
				) : null}
			</section>

			<section className="section">
				<h2>
					Last check
					<span className="count">
						{Number(c.last_check_seq) > 0 ? `#${c.last_check_seq}` : "none run yet"}
					</span>
				</h2>
				<div className="stack">
					<div className="pill-row">
						<VerdictStamp verdict={c.last_check_verdict} />
						<span className="mono small dim">
							{c.last_check_at === "" ? "never" : stamp(c.last_check_at)}
							{c.last_check_by === "" ? "" : ` · asked by ${shortHex(c.last_check_by, 8, 6)}`}
						</span>
					</div>
					<p>{verdictSentence(c.last_check_verdict)}</p>

					{verdictChangedByAbsence ? (
						<p className="dim">
							This is a breach by <em>absence</em>: the promise could not be found at all, and
							the owner declared that a vanished promise counts as a breach. No quote and no
							digest exist for this verdict, which is why none are shown.
						</p>
					) : null}

					{c.last_check_verdict === "UNREACHABLE" ? (
						<p className="dim">
							The source could not be read, so no verdict was reached. The covenant&rsquo;s
							status is unchanged and the check is recorded as what it was: nothing proven.
						</p>
					) : null}

					{Number(c.last_check_seq) > 0 ? (
						<dl className="deflist">
							<dt>Promise present</dt>
							<dd className="serif">
								{c.last_check_quote_present ? "yes — the citation window was found again" : "no"}
							</dd>
							<dt>Anchor drift</dt>
							<dd className="serif">
								{c.last_check_anchor_drifted ? (
									<>
										<strong>Yes.</strong> The window carrying the promise no longer matches the
										digest recorded at activation. The promise is still there, worded
										differently:
										<span className="mono break" style={{ display: "block", marginTop: 8 }}>
											at activation sha256:{shortHex(c.anchor_digest || "0", 10, 6)}
											<br />
											at this check sha256:{shortHex(c.last_check_evidence_digest || "0", 10, 6)}
										</span>
										<p className="hint">
											Drift is reported, not punished. Only the owner&rsquo;s rule can turn
											a page into a breach.
										</p>
									</>
								) : (
									"None recorded for this check."
								)}
							</dd>
							<dt>Evidence digest</dt>
							<dd className="mono break">
								{c.last_check_evidence_digest === ""
									? "none — this verdict rests on absence or on an unreadable source"
									: `sha256:${c.last_check_evidence_digest}`}
							</dd>
							<dt>Page this check read</dt>
							<dd className="mono break">
								{c.last_check_text_digest === "" ? (
									"none recorded — the source could not be read"
								) : (
									`sha256:${c.last_check_text_digest}`
								)}
								<p className="hint">
									The digest of the whole page as this check actually received it, recomputed by
									every validator. Compare it with your own fetch of the source ({" "}
									<code className="mono small">python scripts/page_digest.py &lt;url&gt;</code> ) to
									see whether the contract and you are reading the same copy: sources are served
									through caches nobody here controls, so a check can read a copy that lags the
									live page. That this field moved is how you see it; the verdict alone would not
									tell you.
								</p>
							</dd>
							{c.last_check_rule_span === "" ? null : (
								<dt>Span the model cited</dt>
							)}
							{c.last_check_rule_span === "" ? null : (
								<dd className="serif">
									“{c.last_check_rule_span}”
									<p className="hint">
										Proven verbatim in the validators&rsquo; own fetch of the source, which is
										the only reason it is stored at all.
									</p>
								</dd>
							)}
						</dl>
					) : null}
				</div>
			</section>

			<section className="section">
				<h2>Ask for a re-check</h2>
				<div className="stack">
					<p>
						Any address may ask. A check takes no parameters — not a URL, not a quote, not a
						verdict — so a caller cannot steer what is judged or how. It fetches the pinned
						source again, recomputes the citation and the digest, and applies the owner&rsquo;s
						rule.
					</p>
					{c.status === "ACTIVE" ? (
						<p className="mono small break">{checkCommand(c.covenant_id)}</p>
					) : (
						<p className="dim">
							This covenant is not active, so a check cannot be asked for. Only an ACTIVE
							covenant is re-checked — an activation that was refused or a breach that was
							already found is not something a later caller can move.
						</p>
					)}
					<p className="mono small faint break">{readCommand(c.covenant_id)}</p>
				</div>
			</section>

			<section className="section">
				<h2>The bond, plainly</h2>
				<dl className="deflist">
					<dt>Declared</dt>
					<dd className="mono">
						{bond.gen} GEN <span className="faint">({bond.atto} atto)</span>
						<p className="hint">
							The owner&rsquo;s own claim, in a field labelled as a claim. It is used in no
							decision anywhere in this contract.
						</p>
					</dd>
					<dt>Actually received</dt>
					<dd className="mono">
						{received.gen} GEN <span className="faint">({received.atto} atto)</span>
						<p className="hint">
							What the transaction really carried, read from the virtual machine rather than
							from anyone&rsquo;s claim.
						</p>
					</dd>
					<dt>Held in escrow</dt>
					<dd className="serif">
						<strong>No.</strong> There is no transfer, withdraw, claim or payout method in this
						contract.
						<p className="hint">
							A breach sets a permanent status and pays nobody. On Studionet GEN carries no
							value, so the bond is a number with a label attached — which is exactly what
							this page says it is.
						</p>
					</dd>
					{Number(c.last_check_seq) > 0 ? (
						<>
							<dt>{c.status === "BREACHED" ? "Breached at" : "Still standing"}</dt>
							<dd className="mono">
								{c.status === "BREACHED" ? stamp(c.breached_at) : `no breach found as of check #${c.last_check_seq}`}
							</dd>
						</>
					) : null}
				</dl>
			</section>

			<section className="section">
				<h2>The record itself</h2>
				<details className="payload">
					<summary style={{ padding: "1rem 1.25rem", cursor: "pointer" }} className="mono small">
						Every field the contract returns for this covenant
					</summary>
					<header>
						<span className="caption">get_covenant(&quot;{shortHex(c.covenant_id, 8, 4)}&quot;)</span>
						<Copy value={JSON.stringify(c, null, 2)} label="the full record" />
					</header>
					<pre>{JSON.stringify(c, null, 2)}</pre>
				</details>
			</section>

			<p>
				<Link href="/ledger" className="mono small">
					← every covenant
				</Link>
			</p>
		</>
	);
}
