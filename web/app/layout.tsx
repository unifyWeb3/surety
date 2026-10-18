import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ChainNotice } from "@/components/Notice";
import { loadConfig } from "@/lib/config";

// Two roles, chosen for this product rather than for fashion. Newsreader is a text serif with
// real variation on a page of prose, which is what the owner's promise is. IBM Plex Mono carries
// every value a machine produced -- digests, addresses, sequences -- where aligned digits and
// unmistakable characters matter more than warmth.
const serif = Newsreader({
	variable: "--font-newsreader",
	subsets: ["latin"],
	style: ["normal", "italic"],
	display: "swap",
});

const mono = IBM_Plex_Mono({
	variable: "--font-plex-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "Surety — a public register of promises with proof attached",
	description:
		"Surety puts a recorded bond behind one promise made in one pinned HTTPS source. Validators prove the promise is really there before a covenant goes active, then anyone may ask for a re-check and the owner's own rule decides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const config = loadConfig();

	return (
		<html lang="en" className={`${serif.variable} ${mono.variable}`}>
			<body>
				<div className="shell">
					<header className="masthead">
						<Link href="/" className="wordmark">
							Surety
						</Link>
						<nav>
							<Link href="/">How it decides</Link>
							<Link href="/ledger">Register</Link>
							<Link href="/new">Write a covenant</Link>
						</nav>
					</header>
					{!config.ok ? <ChainNotice problem={config.problem} /> : null}
					<main>{children}</main>
					<footer className="colophon">
						<p>
							Surety records a bond; it does not hold one. There is no transfer, withdraw,
							claim or payout method in the contract, and on this network GEN carries no
							value, so a breach changes a status and pays nobody.
						</p>
						<p className="break">
							{config.ok
								? `Reading ${config.config.contract} over ${config.config.rpcUrl}.`
								: "No chain is configured, so no chain is shown."}
						</p>
					</footer>
				</div>
			</body>
		</html>
	);
}
