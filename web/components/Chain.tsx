import type { ReactNode } from "react";

/**
 * The provenance strip: where the words came from, what the validators actually read, and the
 * digests they recomputed over it. This is the one visual element the product needs most, because
 * a verdict without its citation is just an assertion.
 *
 * The fourth step is the whole-page digest of the fetch itself. It decides nothing — the quote
 * digest does that — but it is the only way a reader can tell whether the contract is looking at
 * the same page they are, or at a cached copy. It exists because a live run hit exactly that: the
 * page changed, and three checks in a row still read the old bytes.
 */
export function Chain({
	url,
	quote,
	digest,
	pageDigest,
	empty,
}: {
	url: string;
	quote: string;
	digest: string;
	pageDigest?: string;
	empty?: ReactNode;
}) {
	if (quote === "" || digest === "") {
		return (
			<div className="notice notice-quiet">
				<p className="kicker">nothing cited yet</p>
				{empty ?? (
					<p className="dim">
						No window of the source has been cited for this covenant, so there is no quote and no
						digest to show. An empty citation is not evidence of anything.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="chain">
			<div>
				<h3>Source, as pinned at creation</h3>
				<p className="machine break">
					<a href={url} rel="noreferrer noopener nofollow" target="_blank">
						{url}
					</a>
				</p>
			</div>
			<div>
				<span className="arrow" aria-hidden="true">
					→
				</span>
				<h3>Window cited from it</h3>
				<p className="quote">“{quote}”</p>
			</div>
			<div>
				<span className="arrow" aria-hidden="true">
					→
				</span>
				<h3>Digest every validator recomputed</h3>
				<p className="machine">sha256({quote.length} chars)</p>
				<p className="machine">{digest}</p>
			</div>
			{pageDigest ? (
				<div>
					<span className="arrow" aria-hidden="true">
						→
					</span>
					<h3>Digest of the whole page it read</h3>
					<p className="machine">{pageDigest}</p>
					<p className="hint">
						Over the normalized text of that fetch, not over the quote. Fetch the URL yourself,
						normalize it the same way, and compare: equal digests mean you and the contract read
						the same page, different ones mean one of you was served a cached copy.
					</p>
				</div>
			) : null}
		</div>
	);
}
