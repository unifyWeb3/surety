/**
 * Chain configuration, and the rule that a missing configuration is an error.
 *
 * Fail closed: there is no default RPC and no default contract address anywhere in this app. A
 * page that cannot be told where to read shows a stated problem instead of a plausible-looking
 * empty register. A default would be worse than a blank page here — a reader cannot tell a
 * fabricated "ACTIVE" from a real one, and must never be given the chance.
 *
 * Only NEXT_PUBLIC_ variables are read, and nothing in web/ ever holds a key.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type Config = {
	rpcUrl: string;
	contract: `0x${string}`;
};

export type ConfigResult = { ok: true; config: Config } | { ok: false; problem: string };

export function loadConfig(): ConfigResult {
	const rpcRaw = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? "";
	const contractRaw = process.env.NEXT_PUBLIC_SURETY_CONTRACT ?? "";

	const rpcUrl = rpcRaw.trim();
	const contract = contractRaw.trim();

	const missing: string[] = [];
	if (rpcUrl === "") missing.push("NEXT_PUBLIC_GENLAYER_RPC_URL");
	if (contract === "") missing.push("NEXT_PUBLIC_SURETY_CONTRACT");

	if (missing.length > 0) {
		return {
			ok: false,
			problem:
				`This deployment has no chain configuration: ${missing.join(" and ")} ` +
				`${missing.length > 1 ? "are" : "is"} unset. Nothing on this page is being read ` +
				`from a chain, and no register is being shown, because showing an unconfigured ` +
				`register as an empty one would be a lie.`,
		};
	}

	let parsed: URL;
	try {
		parsed = new URL(rpcUrl);
	} catch {
		return {
			ok: false,
			problem:
				`NEXT_PUBLIC_GENLAYER_RPC_URL is not a URL (got "${rpcUrl}"). ` +
				`Expected an http(s) JSON-RPC endpoint, for example https://studio.genlayer.com/api.`,
		};
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return {
			ok: false,
			problem: `NEXT_PUBLIC_GENLAYER_RPC_URL must be http or https, not ${parsed.protocol}.`,
		};
	}

	if (!ADDRESS.test(contract)) {
		return {
			ok: false,
			problem:
				`NEXT_PUBLIC_SURETY_CONTRACT is not a 0x address (got "${contract}"). ` +
				`Expected 42 characters: 0x followed by 40 hex digits.`,
		};
	}

	return {
		ok: true,
		config: { rpcUrl, contract: contract as `0x${string}` },
	};
}

/** True when a page is allowed to attempt a chain read at all. */
export function configOr(problem: (text: string) => void): Config | null {
	const result = loadConfig();
	if (!result.ok) {
		problem(result.problem);
		return null;
	}
	return result.config;
}
