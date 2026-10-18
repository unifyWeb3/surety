"use client";

import Link from "next/link";

/**
 * A page that could not render says so, and says which digest it failed on, rather than showing a
 * register that looks merely empty.
 */
export default function ErrorBoundary({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<section>
			<p className="eyebrow">Unhandled error</p>
			<h1>This page failed before it could read the register</h1>
			<div className="notice notice-alert">
				<p className="kicker">what the page reported</p>
				<p className="break">{error.message || "no message"}</p>
				{error.digest ? <p className="mono small">digest {error.digest}</p> : null}
			</div>
			<div className="actions" style={{ marginTop: "1.5rem" }}>
				<button type="button" onClick={reset}>
					Try again
				</button>
				<Link href="/ledger" className="mono small">
					→ the register
				</Link>
			</div>
		</section>
	);
}
