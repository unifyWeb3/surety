import { readRuleShape } from "@/lib/chain";

export const dynamic = "force-dynamic";

// A read can take several seconds (Studio answered a single view in 3–11s when this was
// measured) and the client makes one bounded retry on a transport failure, so the segment needs
// more than a default serverless timeout to let that retry finish. Values are still only ever
// read fresh: this app never renders a cached verdict.
export const maxDuration = 30;

/**
 * POST /api/rule — the contract's own reading of a breach rule.
 *
 * The compose page keeps a mirror of the rule language so it can answer instantly, and this
 * endpoint is how a reader checks that mirror against the authority. A rule the contract rejects
 * is reported as rejected, with the contract's reason; nothing is smoothed over.
 */
export async function POST(request: Request) {
	let rule: unknown;
	try {
		const body = (await request.json()) as { rule?: unknown };
		rule = body.rule;
	} catch {
		return Response.json({ ok: false, error: "Body must be JSON: {\"rule\": \"…\"}." }, { status: 400 });
	}

	if (typeof rule !== "string" || rule.trim() === "") {
		return Response.json({ ok: false, error: "A rule must be a non-empty string." }, { status: 400 });
	}

	const result = await readRuleShape(rule);
	if (!result.ok) {
		return Response.json({ ok: false, error: result.error }, { status: 502 });
	}

	return Response.json({ ok: true, shape: result.value });
}
