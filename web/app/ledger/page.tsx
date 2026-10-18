import Link from "next/link";
import { Suspense } from "react";
import { LedgerRow, LedgerTable } from "@/components/Ledger";
import { ChainNotice, EmptyLedger, ReadFailure } from "@/components/Notice";
import { Stamp, VerdictStamp } from "@/components/Stamp";
import { readCovenant, readCovenantsOf, readLedger, readStats } from "@/lib/chain";
import { loadConfig } from "@/lib/config";
import { shortHex, stamp } from "@/lib/format";

export const dynamic = "force-dynamic";

// A read can take several seconds (Studio answered a single view in 3–11s when this was
// measured) and the client makes one bounded retry on a transport failure, so the segment needs
// more than a default serverless timeout to let that retry finish. Values are still only ever
// read fresh: this app never renders a cached verdict.
export const maxDuration = 30;

const PAGE_SIZE = 24;

export default async function LedgerPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const rawOffset = Array.isArray(params.offset) ? params.offset[0] : params.offset;
	const rawOwner = Array.isArray(params.owner) ? params.owner[0] : params.owner;
	const owner = (rawOwner ?? "").trim().toLowerCase();
	const offset = Math.max(0, Number.parseInt(rawOffset ?? "0", 10) || 0);
	const config = loadConfig();

	return (
		<>
			<section>
				<p className="eyebrow">The register</p>
				<h1>Every covenant on this contract</h1>
				<p className="lede">
					Newest first, exactly as the contract returns them, {PAGE_SIZE} to a page. A row is
					the owner&rsquo;s own words plus whatever the validators proved; nothing below is
					summarised or ranked by this page.
				</p>
				<form method="get" className="actions" style={{ marginTop: "1.5rem" }}>
					<div className="field" style={{ marginBottom: 0 }}>
						<label htmlFor="owner">Filter by owner address</label>
						<input
							id="owner"
							name="owner"
							type="text"
							defaultValue={owner}
							placeholder="0x…"
							spellCheck={false}
							autoComplete="off"
							style={{ width: "46ch" }}
						/>
						<p className="hint">
							The contract validates the shape and scans its most recent 400 covenants. Older
							ones stay readable one at a time by their id.
						</p>
					</div>
					<button type="submit">Filter</button>
					{owner !== "" ? (
						<Link href="/ledger" className="mono small">
							clear
						</Link>
					) : null}
				</form>
			</section>

			{!config.ok ? (
				<ChainNotice problem={config.problem} />
			) : (
				<section className="section">
					<Suspense fallback={<p className="mono faint pending">Reading the register…</p>}>
						{owner === "" ? <RegisterPage offset={offset} /> : <OwnerRegister owner={owner} />}
					</Suspense>
				</section>
			)}
		</>
	);
}

async function RegisterPage({ offset }: { offset: number }) {
	const [ids, stats] = await Promise.all([readLedger(offset, PAGE_SIZE), readStats()]);

	if (!ids.ok) {
		return <ReadFailure title="The register index could not be read" error={ids.error} />;
	}
	if (ids.value.length === 0) {
		return offset === 0 ? (
			<EmptyLedger
				note={
					<p>
						The contract answered and holds no covenants.{" "}
						<Link href="/new">Compose one.</Link>
					</p>
				}
			/>
		) : (
			<EmptyLedger
				note={
					<p>
						No covenants at this offset. <Link href="/ledger">Back to the newest.</Link>
					</p>
				}
			/>
		);
	}

	const rows = await Promise.all(ids.value.map((id) => readCovenant(id)));
	const present = rows.flatMap((row) => (row.ok ? [row.value] : []));
	const failures = rows.flatMap((row) => (row.ok ? [] : [row.error]));

	return (
		<div className="stack">
			{failures.length > 0 ? (
				<ReadFailure
					title={`${failures.length} of ${ids.value.length} rows could not be read`}
					error={failures.join(" / ")}
				/>
			) : null}
			{present.length > 0 ? (
				<>
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
										<div className="faint">
											{covenant.last_check_seq === "0" ? "—" : `#${covenant.last_check_seq}`}
										</div>
										<div className="faint">
											{covenant.last_check_at === "" ? "" : stamp(covenant.last_check_at)}
										</div>
									</>
								}
							/>
						))}
					</LedgerTable>
					<div className="actions">
						{offset > 0 ? (
							<Link
								href={`/ledger?offset=${Math.max(0, offset - PAGE_SIZE)}`}
								className="mono small"
							>
								← newer
							</Link>
						) : null}
						{ids.value.length === PAGE_SIZE ? (
							<Link href={`/ledger?offset=${offset + PAGE_SIZE}`} className="mono small">
								older →
							</Link>
						) : (
							<span className="mono small faint">end of the register</span>
						)}
						{stats.ok ? (
							<span className="mono small faint">
								{stats.value.covenants} covenants in total · {stats.value.checks} checks run ·{" "}
								{stats.value.breaches} breaches
							</span>
						) : null}
					</div>
				</>
			) : null}
		</div>
	);
}

async function OwnerRegister({ owner }: { owner: string }) {
	if (!/^0x[0-9a-f]{40}$/.test(owner)) {
		return (
			<ReadFailure
				title="That is not an owner address"
				error={`An owner address is 0x followed by 40 hex characters; "${owner}" is neither, so no query was sent.`}
			/>
		);
	}

	const rows = await readCovenantsOf(owner);
	if (!rows.ok) {
		return <ReadFailure title={`Covenants of ${shortHex(owner, 8, 6)} could not be read`} error={rows.error} />;
	}
	if (rows.value.length === 0) {
		return (
			<EmptyLedger
				note={
					<p>
						{owner} has no covenants in the contract&rsquo;s most recent 400 records. If they
						have older ones, read them by id. <Link href="/ledger">Show everything.</Link>
					</p>
				}
			/>
		);
	}

	return (
		<div className="stack">
			<p className="mono small dim">
				{rows.value.length} covenant{rows.value.length === 1 ? "" : "s"} owned by {owner}
			</p>
			<LedgerTable>
				{rows.value.map((covenant) => (
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
								<div className="faint">
									{covenant.last_check_seq === "0" ? "—" : `#${covenant.last_check_seq}`}
								</div>
							</>
						}
					/>
				))}
			</LedgerTable>
		</div>
	);
}
