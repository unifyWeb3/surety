import Link from "next/link";

export default function NotFound() {
	return (
		<>
			<section>
				<p className="eyebrow">404</p>
				<h1>No page here</h1>
				<p className="lede">
					If you were looking for a covenant, its address is a 64-character id on the register.
					A wrong id is not a missing covenant, so this page says so instead of showing you an
					empty one.
				</p>
				<p>
					<Link href="/ledger" className="mono small">
						→ the register
					</Link>
				</p>
			</section>
		</>
	);
}
