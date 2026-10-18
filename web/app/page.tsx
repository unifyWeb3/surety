import Link from "next/link";
import { Suspense } from "react";
import { LedgerRow, LedgerTable } from "@/components/Ledger";
import { ChainNotice, EmptyLedger, ReadFailure } from "@/components/Notice";
import { Stamp, VerdictStamp } from "@/components/Stamp";
import { readCovenant, readLedger, readStats } from "@/lib/chain";
import { loadConfig } from "@/lib/config";
import { shortHex, stamp } from "@/lib/format";

export const dynamic = "force-dynamic";

// A read can take several seconds (Studio answered a single view in 3–11s when this was
// measured) and the client makes one bounded retry on a transport failure, so the segment needs
// more than a default serverless timeout to let that retry finish. Values are still only ever
// read fresh: this app never renders a cached verdict.
export const maxDuration = 30;

export default function HomePage() {
	const config = loadConfig();

	return (
		<>
			<section>
				<p className="eyebrow">Surety · promise register · Studionet</p>
				<h1>A public register of promises, with the proof attached.</h1>
				<p className="lede">
					An owner writes down one promise made in one public web page, the rule that counts as
					breaking it, and the bond they mean to stand behind. Validators then fetch that page
					themselves and prove the promise is really in it before anything goes active. After
					that, anyone at all can ask for a re-check, and the owner&rsquo;s own rule decides.
				</p>
			</section>

			<section className="section">
				<h2>Three facts decide everything</h2>
				<dl className="deflist">
					<dt>One pinned source</dt>
					<dd className="serif">
						A single https URL, fixed when the covenant is written. No method in the contract
						accepts a URL afterwards, so the owner cannot quietly repoint the promise at a
						page that suits them.
					</dd>
					<dt>One cited window</dt>
					<dd className="serif">
						The validators cite the passage that carries the promise — bounded, quoted, and
						reduced to a sha256 digest each of them recomputes over its own fetch. A quote
						that is not in a validator&rsquo;s own bytes is a fabrication and is rejected.
					</dd>
					<dt>The owner&rsquo;s own rule</dt>
					<dd className="serif">
						Not a court&rsquo;s opinion and not a stranger&rsquo;s. A breach is either a
						literal string leaving or entering the page, decided with no model at all, or one
						plain sentence the owner wrote, decided by model vote.
					</dd>
				</dl>
			</section>

			<section className="section split">
				<div>
					<p className="eyebrow">What it is not</p>
					<h2>No escrow, no arbitration, no court</h2>
					<div className="stack small">
						<p>
							The bond is <em>recorded</em>, not held. The contract contains no transfer,
							withdraw, claim or payout method — not a disabled one, not a paused one. A breach
							sets a permanent public status and pays nobody.
						</p>
						<p>
							Nobody is put on trial: only a page the owner themselves pinned is fetched, and
							the verdict is about that page, not about a person. There is no appeal to a human
							and no freeze.
						</p>
						<p>
							On this network GEN carries no value, so the bond is a number with a label
							attached. Anything that claimed otherwise would be lying about which chain this
							is.
						</p>
					</div>
				</div>
				<div>
					<p className="eyebrow">The three moves</p>
					<h2>Write, prove, re-check</h2>
					<ol>
						<li>
							<strong>Write.</strong> The owner fixes the source, the promise, the rule, the
							permitted changes, the beneficiary and the cooldown. Nothing here can be edited
							later; there is no setter in the contract.
						</li>
						<li>
							<strong>Prove.</strong> <em>Anyone</em> may trigger activation, because the terms
							are already fixed and there is nothing for a caller to steer. Validators fetch the
							source and refuse unless the promise is physically present and the rule is not
							already broken.
						</li>
						<li>
							<strong>Re-check.</strong> Once active, any address may ask for a re-check. The
							owner&rsquo;s cooldown limits how often, and a breach found is permanent. A false
							alarm is impossible to argue away — which is why the rule is the owner&rsquo;s, and
							why the citation is kept.
						</li>
					</ol>
				</div>
			</section>

			{config.ok ? (
				<>
					<section className="section">
						<h2>
							The register right now
							<span className="count">read from {shortHex(config.config.contract, 8, 6)}</span>
						</h2>
						<Suspense fallback={<StatsSkeleton />}>
							<LiveStats />
						</Suspense>
					</section>

					<section className="section">
						<h2>
							Most recent covenants
							<span className="count">
								<Link href="/ledger">the whole register</Link>
							</span>
						</h2>
						<Suspense fallback={<RowsSkeleton />}>
							<RecentCovenants />
						</Suspense>
					</section>
				</>
			) : (
				<ChainNotice problem={config.problem} />
			)}
		</>
	);
}

async function LiveStats() {
	const result = await readStats();
	if (!result.ok) {
		return <ReadFailure title="The register's counters could not be read" error={result.error} />;
	}
	const stats = result.value;
	return (
		<div className="stack">
			<div className="leader">
				<span className="key">covenants written</span>
				<span className="value">{stats.covenants}</span>
			</div>
			<div className="leader">
				<span className="key">breaches found</span>
				<span className="value">{stats.breaches}</span>
			</div>
			<div className="leader">
				<span className="key">activations refused</span>
				<span className="value">{stats.activationRefusals}</span>
			</div>
			<div className="leader">
				<span className="key">checks run</span>
				<span className="value">{stats.checks}</span>
			</div>
			<div className="leader">
				<span className="key">cooldown accepted by the contract</span>
				<span className="value">
					{stats.minCooldownSeconds}s … {Math.round(stats.maxCooldownSeconds / 86400)}d
				</span>
			</div>
			<div className="leader">
				<span className="key">value held by this contract</span>
				<span className="value">none</span>
			</div>
			<p className="dim small">
				Refusals are counted separately from breaches on purpose. A refusal means nothing could
				be proven — an unreachable source, a promise that was not in the page. It is not an
				accusation and changes no verdict.
			</p>
		</div>
	);
}

async function RecentCovenants() {
	const ids = await readLedger(0, 6);
	if (!ids.ok) {
		return <ReadFailure title="The register index could not be read" error={ids.error} />;
	}
	if (ids.value.length === 0) {
		return (
			<EmptyLedger
				note={
					<p>
						The contract is live and answered, and it holds no covenants yet.{" "}
						<Link href="/new">Compose the first one.</Link>
					</p>
				}
			/>
		);
	}

	const rows = await Promise.all(ids.value.map((id) => readCovenant(id)));
	const failed = rows.filter((row) => !row.ok);
	const present = rows.flatMap((row) => (row.ok ? [row.value] : []));

	return (
		<div className="stack">
			{failed.length > 0 ? (
				<ReadFailure
					title={`${failed.length} of ${ids.value.length} rows could not be read`}
					error={failed.map((row) => (row.ok ? "" : row.error)).join(" / ")}
				/>
			) : null}
			{present.length > 0 ? (
				<LedgerTable>
					{present.map((covenant) => (
						<LedgerRow
							key={covenant.covenant_id}
							statusCell={<Stamp status={covenant.status} />}
							href={`/covenant/${covenant.covenant_id}`}
							label={covenant.label}
							promise={covenant.promise_text}
							rule={covenant.breach_rule}
							subject={covenant.subject}
							owner={shortHex(covenant.owner, 6, 4)}
							lastCheck={
								<>
									<VerdictStamp verdict={covenant.last_check_verdict} />
									<div className="faint">{covenant.last_check_seq === "0" ? "—" : `#${covenant.last_check_seq}`}</div>
									<div className="faint">{covenant.last_check_at === "" ? "" : stamp(covenant.last_check_at)}</div>
								</>
							}
						/>
					))}
				</LedgerTable>
			) : null}
		</div>
	);
}

function StatsSkeleton() {
	return (
		<div className="stack pending" aria-live="polite">
			<p className="mono faint">Reading the contract…</p>
			<div className="skeleton" />
			<div className="skeleton" />
			<div className="skeleton" />
		</div>
	);
}

function RowsSkeleton() {
	return (
		<div className="pending" aria-live="polite">
			<p className="mono faint">Reading the register index…</p>
			<div className="skeleton" />
			<div className="skeleton" style={{ maxWidth: "28ch" }} />
			<div className="skeleton" />
		</div>
	);
}
