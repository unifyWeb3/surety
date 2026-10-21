/**
 * The copy sweep: no file in the reader, the scripts or the docs may offer a retry of a
 * refused activation.
 *
 * This test is deliberately independent of `web/lib/status.ts` and of the page component, so it
 * can be run against any tree, old or new, and it fails loudly when a file offers a recovery
 * path the contract does not have.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/** Walk up to the repository root: the files worth sweeping live outside web/. */
function repoRoot(): string {
	let dir = __dirname;
	for (let i = 0; i < 8; i++) {
		if (fs.existsSync(path.join(dir, "contracts", "surety.py"))) return dir;
		dir = path.dirname(dir);
	}
	throw new Error("could not find the repository root from " + __dirname);
}

function filesUnder(root: string, relative: string): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (["node_modules", ".next", ".test-build", ".venv", ".venv-deploy"].includes(entry.name)) {
					continue;
				}
				walk(full);
			} else {
				found.push(full);
			}
		}
	};
	walk(path.join(root, relative));
	return found;
}

/**
 * Quoted text is evidence, not a promise.
 *
 * A file may quote the old copy to say "this used to be here" — that is a record, not an offer.
 * So the quotes are removed before the sweep, and the findings file no longer needs an
 * exemption: it can keep the old words verbatim, and they will not count against it.
 */
function withoutQuotedText(text: string): string {
	return text
		.replace(/`[^`]*`/g, " ")
		.replace(/"[^"]*"/g, " ")
		.replace(/“[^”]*”/g, " ");
}

test("no file in the reader or the docs offers a retry of a refused activation", () => {
	const root = repoRoot();
	const files = [
		...filesUnder(root, "web/app"),
		...filesUnder(root, "web/components"),
		...filesUnder(root, "web/lib"),
		...filesUnder(root, "scripts"),
		path.join(root, "README.md"),
		path.join(root, "web/README.md"),
		path.join(root, "REPORT.md"),
		path.join(root, "state/DESIGN.md"),
		path.join(root, "state/DESIGN-refusal.md"),
		path.join(root, "state/MEMORY.md"),
	].filter((file) => fs.existsSync(file));

	const forbidden = /Retrying activation is allowed|retry the activation|activation can be retried/i;
	const offenders: string[] = [];
	for (const file of files) {
		if (!/\.(ts|tsx|md|py)$/.test(file)) continue;
		const text = withoutQuotedText(fs.readFileSync(file, "utf8"));
		if (forbidden.test(text)) offenders.push(path.relative(root, file));
	}
	assert.deepEqual(offenders, [], "a file still offers a retry of a refused activation");
});
