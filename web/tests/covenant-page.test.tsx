/**
 * The covenant page's own copy, rendered.
 *
 * The pure function is tested in `status.test.ts`. This file checks the page half: what the
 * reader is actually shown for each status. The bug the steward reported was a page that told a
 * reader activation "can be retried" and printed the activate command for a covenant the
 * contract had already refused, so the rendered output is what is asserted here.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { NothingCited } from "../components/NothingCited";
import { CONTRACT_STATUSES } from "../lib/status";

const COVENANT_ID = "a".repeat(64);

function render(status: (typeof CONTRACT_STATUSES)[number]): string {
	return renderToStaticMarkup(<NothingCited status={status} covenantId={COVENANT_ID} />);
}

test("a covenant awaiting activation is offered the activate command", () => {
	const html = render("AWAITING_ACTIVATION");
	assert.match(html, /activate_covenant\.py/);
	assert.match(html, /Nothing has been cited yet/);
});

test("a refused covenant is shown no activate command at all", () => {
	for (const status of CONTRACT_STATUSES) {
		if (status === "AWAITING_ACTIVATION") continue;
		const html = render(status);
		assert.doesNotMatch(html, /activate_covenant\.py/, `${status} rendered an activate command`);
	}
});

test("a refusal says the covenant cannot be activated or retried", () => {
	for (const status of [
		"REFUSED_PROMISE_ABSENT",
		"REFUSED_SUBJECT_ABSENT",
		"REFUSED_ALREADY_IN_BREACH",
		"REFUSED_SOURCE_UNREACHABLE",
	] as const) {
		const html = render(status);
		assert.match(html, /terminal/i, `${status} copy`);
		assert.match(html, /cannot be activated or retried/, `${status} copy`);
		assert.match(html, /new covenant/, `${status} copy`);
	}
});

test("no rendered status claims a retry is available", () => {
	for (const status of CONTRACT_STATUSES) {
		const html = render(status);
		assert.doesNotMatch(html, /Retrying activation/i, `${status} copy`);
		assert.doesNotMatch(html, /costs nothing/i, `${status} copy`);
	}
});
