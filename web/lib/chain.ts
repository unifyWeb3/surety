/**
 * Reads. Every call goes through `readView`, so every call can fail the same way and every page
 * has one kind of error to render. Writes are deliberately absent: this app composes and reads,
 * it never signs, and it holds no key.
 */

import { createClient } from "genlayer-js";
import { loadConfig, type Config } from "./config";
import { toCovenant, type Covenant, type RawStats, type Stats } from "./types";

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: string };

const TIMEOUT_MS = 20_000;

/** Human sentence for whatever the RPC threw, never an empty string and never a stack trace. */
function explain(error: unknown): string {
	const text = error instanceof Error ? error.message : String(error);
	if (/not found/i.test(text)) {
		return "The configured address has no contract on this chain. Check NEXT_PUBLIC_SURETY_CONTRACT against the deployment you expect to be reading.";
	}
	if (/timeout|timed out|aborted/i.test(text)) {
		return `No answer from the RPC within ${TIMEOUT_MS / 1000} seconds. The chain may be busy; the value shown is unknown, not zero.`;
	}
	if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(text)) {
		return "The RPC could not be reached from this deployment. The value shown is unknown, not zero.";
	}
	return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const clock = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("request timed out")), TIMEOUT_MS);
	});
	try {
		return (await Promise.race([work, clock])) as T;
	} finally {
		clearTimeout(timer!);
	}
}

async function client(config: Config) {
	return createClient({
		// `endpoint` overrides the preset chain's RPC, which is what keeps this app bound to the
		// endpoint the operator configured rather than to whatever a library ships.
		endpoint: config.rpcUrl,
	});
}

async function readView<T>(functionName: string, args: string[] = []): Promise<ReadResult<T>> {
	const result = loadConfig();
	if (!result.ok) {
		return { ok: false, error: result.problem };
	}
	try {
		const rpc = await client(result.config);
		const value = (await withTimeout(
			rpc.readContract({
				address: result.config.contract,
				functionName,
				// Every argument this app passes is a string: ids, addresses, decimal integers.
				// The SDK's CalldataEncodable union is wider than that, and narrowing it here
				// rather than loosening the call sites keeps the string discipline visible.
				args: args as never,
			}),
		)) as T;
		return { ok: true, value };
	} catch (error) {
		return { ok: false, error: explain(error) };
	}
}

export async function readStats(): Promise<ReadResult<Stats>> {
	const raw = await readView<RawStats>("stats");
	if (!raw.ok) return raw;
	return { ok: true, value: normaliseStats(raw.value) };
}

export async function readCovenant(id: string): Promise<ReadResult<Covenant>> {
	if (!/^[0-9a-f]{64}$/.test(id)) {
		return {
			ok: false,
			error: `A covenant id is 64 hex characters. "${id}" is not one, so nothing was read.`,
		};
	}
	const raw = await readView<Record<string, unknown>>("get_covenant", [id]);
	if (!raw.ok) return raw;
	try {
		return { ok: true, value: toCovenant(raw.value) };
	} catch (error) {
		return {
			ok: false,
			error: `The contract answered, but not with a covenant this page understands: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

/** Newest first, as the contract returns them. `offset` pages back through history. */
export async function readLedger(offset = 0, limit = 24): Promise<ReadResult<string[]>> {
	const raw = await readView<string[]>("list_all", [String(offset), String(limit)]);
	if (!raw.ok) return raw;
	return { ok: true, value: (raw.value ?? []).map((row) => String(row)) };
}

export async function readCovenantsOf(owner: string): Promise<ReadResult<Covenant[]>> {	const raw = await readView<Record<string, unknown>[]>("list_covenants", [owner]);
	if (!raw.ok) return raw;
	try {
		return { ok: true, value: (raw.value ?? []).map(toCovenant) };
	} catch (error) {
		return {
			ok: false,
			error: `The contract answered, but not with covenants this page understands: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

/**
 * Ask the contract itself how it reads a breach rule.
 *
 * Deterministic and fetch-free, so a reader can confirm that this page's rule mirror agrees with
 * the contract that will actually judge them, before anything is signed. The contract's answer is
 * the authority; the mirror exists only to be fast.
 */
export async function readRuleShape(
	rule: string,
): Promise<ReadResult<{ valid: boolean; kind: string; argument: string; needs_model: boolean }>> {
	return readView("rule_shape", [rule]);
}

function normaliseStats(raw: RawStats): Stats {
	const pick = (value: unknown): number => {
		if (typeof value === "number") return value;
		if (typeof value === "bigint") return Number(value);
		if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
		return 0;
	};
	return {
		covenants: pick(raw.covenants),
		breaches: pick(raw.breaches),
		activationRefusals: pick(raw.activation_refusals),
		checks: pick(raw.checks),
		minCooldownSeconds: pick(raw.min_cooldown_seconds),
		maxCooldownSeconds: pick(raw.max_cooldown_seconds),
		listScanCap: pick(raw.list_scan_cap),
		listResultsCap: pick(raw.list_results_cap),
		networkValue: String(raw.network_value ?? "unknown"),
	};
}
