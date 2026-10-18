import type { ReactNode } from "react";

/**
 * The provenance strip: where the words came from, what the validators actually read, and the
 * digest they recomputed over it. This is the one visual element the product needs most, because
 * a verdict without its citation is just an assertion.
 */
export function Chain({
	url,
	quote,
	digest,
	empty,
}: {
	url: string;
	quote: string;
	digest: string;
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
		</div>
	);
}
