// Relative imports, not the "@/…" alias: this component is also compiled by the plain-node test
// build (tsconfig.test.json), which resolves nothing but relative paths.
import { activateCommandFor } from "../lib/commands";
import { statusView, type CovenantStatus } from "../lib/status";

/**
 * What the citation strip says when there is no citation.
 *
 * The decision comes from one place: `statusView`. The activate command is rendered only when
 * the contract's `activate` would accept the covenant, which is the single status
 * `AWAITING_ACTIVATION`. Every refusal is terminal, so a refused covenant shows no command at
 * all: the contract would answer `[EXPECTED] covenant is not awaiting activation`.
 */
export function NothingCited({
	status,
	covenantId,
}: {
	status: CovenantStatus;
	covenantId: string;
}) {
	const view = statusView(status);
	const command = activateCommandFor(status, covenantId);

	if (command !== null) {
		return (
			<p className="dim">
				Nothing has been cited yet because activation has not run. Until it does, this covenant
				watches nothing. Any address may run it:
				<code className="mono small break" style={{ display: "block", marginTop: 8 }}>
					{command}
				</code>
			</p>
		);
	}

	if (view.terminal) {
		return (
			<p className="dim">
				Nothing was cited, because nothing was proven. An empty citation is not evidence of
				anything, and this contract does not pretend otherwise. This status is terminal: the
				covenant cannot be activated or retried, so no activate command is shown. The way
				forward is a new covenant.
			</p>
		);
	}

	return (
		<p className="dim">
			No window of the source has been cited for this covenant, so there is no quote and no
			digest to show. An empty citation is not evidence of anything.
		</p>
	);
}
