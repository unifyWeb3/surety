/**
 * The covenant page's own source, checked.
 *
 * This file reads `web/app/covenant/[id]/page.tsx` and asserts how it is wired: it must take
 * its wording and its command from the shared helpers, and it must not contain the old copy
 * that told a reader a refused activation could be retried. It deliberately imports nothing
 * from the app, so it runs against any tree and fails loudly on the old page.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/** Walk up to the repository root. */
function repoRoot(): string {
	let dir = __dirname;
	for (let i = 0; i < 8; i++) {
		if (fs.existsSync(path.join(dir, "contracts", "surety.py"))) return dir;
		dir = path.dirname(dir);
	}
	throw new Error("could not find the repository root from " + __dirname);
}

function read(relative: string): string {
	return fs.readFileSync(path.join(repoRoot(), relative), "utf8");
}

test("the covenant page takes its empty state from the gated component", () => {
	const source = read(path.join("web", "app", "covenant", "[id]", "page.tsx"));
	assert.match(source, /NothingCited/, "the page does not use the gated empty state");
});

test("the covenant page does not build an activate command itself", () => {
	const source = read(path.join("web", "app", "covenant", "[id]", "page.tsx"));
	assert.doesNotMatch(source, /activateCommand\(/, "the page builds an activate command itself");
});

test("the covenant page does not say a refused activation can be retried", () => {
	const source = read(path.join("web", "app", "covenant", "[id]", "page.tsx"));
	assert.doesNotMatch(source, /Retrying activation/i, "the page still says a retry is allowed");
	assert.doesNotMatch(source, /costs nothing/i, "the page still says a retry costs nothing");
});
