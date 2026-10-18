import Link from "next/link";
import { Composer } from "./Composer";
import { ChainNotice } from "@/components/Notice";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function NewCovenantPage() {
	const config = loadConfig();

	return (
		<>
			<section>
				<p className="eyebrow">Compose · nothing is signed here</p>
				<h1>Write a covenant</h1>
				<p className="lede">
					Six terms and no options that can be changed later. What you write is what validators
					will fetch, what the citation will be built from, and what a later check will apply —
					there is no setter in the contract to soften any of it afterwards.
				</p>
				<p className="dim">
					Read the{" "}
					<Link href="/">three facts that decide everything</Link> first if you have not: the
					pinned source, the cited window, and your own rule.
				</p>
			</section>

			<section className="section">
				{config.ok ? (
					<Composer />
				) : (
					<ChainNotice problem={config.problem} />
				)}
			</section>
		</>
	);
}
