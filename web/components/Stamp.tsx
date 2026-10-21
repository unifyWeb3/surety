import { toneOf } from "@/lib/format";
import type { CovenantStatus, Verdict } from "@/lib/types";
import type { Tone } from "@/lib/format";

const TONE_CLASS: Record<Tone, string> = {
	awaiting: "st-awaiting",
	active: "st-active",
	refused: "st-refused",
	breached: "st-breached",
	plain: "st-plain",
};

/**
 * The status seal. A bond carries a stamp; this one carries the machine verdict, and the visible
 * word is always the contract's own enum rather than a friendlier synonym for it.
 */
export function Stamp({ status, size = "sm" }: { status: CovenantStatus; size?: "sm" | "lg" }) {
	return (
		<span className={`stamp ${TONE_CLASS[toneOf(status)]} ${size === "lg" ? "stamp-lg" : ""}`}>
			{status.replaceAll("_", " ")}
		</span>
	);
}

export function VerdictStamp({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
	const tone: Tone = verdict === "BREACH" ? "breached" : verdict === "NO_BREACH" ? "active" : "refused";
	return (
		<span className={`stamp ${TONE_CLASS[tone]} ${size === "lg" ? "stamp-lg" : ""}`}>
			{verdict.replaceAll("_", " ")}
		</span>
	);
}

