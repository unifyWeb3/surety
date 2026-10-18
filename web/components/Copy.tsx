"use client";

/**
 * Copy a value to the clipboard, and say so only when it actually happened.
 *
 * navigator.clipboard is unavailable on insecure origins, which is exactly where a reviewer may
 * open this page, so a failure is reported rather than swallowed.
 */

import { useState } from "react";

export function Copy({ value, label }: { value: string; label: string }) {
	const [state, setState] = useState<"idle" | "done" | "failed">("idle");

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setState("done");
		} catch {
			setState("failed");
		}
	}

	return (
		<span className="pill-row">
			<button type="button" className="ghost" onClick={copy} aria-label={`${label}: copy to clipboard`}>
				Copy
			</button>
			<span className="mono faint" role="status">
				{state === "done" ? "copied" : null}
				{state === "failed" ? "clipboard blocked here — select the text instead" : null}
			</span>
		</span>
	);
}
