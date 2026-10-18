"""Deploy contracts/surety.py to Studionet and record the address in .env.surety.

The address is only written down after the deployed code has been read back from the node and
compared, byte for byte, with the file in this repository. A deploy that finalised but produced
something other than this file is reported as a failure, not recorded as a success.

Usage:  python scripts/deploy.py
"""

from __future__ import annotations

import base64
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _surety  # noqa: E402

CONTRACT = _surety.ROOT / "contracts" / "surety.py"

# Outcomes that mean the validators agreed. Anything else is a consensus failure.
AGREED = {"MAJORITY_AGREE", "MAJORITY_AGREEMENT", "AGREE"}


def set_contract_in_env(address: str) -> None:
	path = _surety.ENV_FILE
	lines = path.read_text().splitlines()
	out = []
	found = False
	for line in lines:
		if line.startswith("SURETY_CONTRACT="):
			out.append("SURETY_CONTRACT=%s" % address)
			found = True
		else:
			out.append(line)
	if not found:
		out.append("SURETY_CONTRACT=%s" % address)
	path.write_text("\n".join(out) + "\n")


def code_on_chain(conn, address: str) -> bytes:
	"""Read the deployed source back out of the node, exactly as the node holds it."""
	result = conn.provider.make_request(method="gen_getContractCode", params=[address])["result"]
	return base64.b64decode(result)


def main() -> int:
	_surety.load_env()
	source = CONTRACT.read_text()
	source_bytes = source.encode()
	conn = _surety.client()

	print("contract file: %s" % CONTRACT)
	print("  bytes:  %d" % len(source_bytes))
	print("  sha256: %s" % hashlib.sha256(source_bytes).hexdigest())
	print("deployer address: %s" % _surety.address())
	print("rpc: %s" % _surety.rpc_url())

	tx_hash = conn.deploy_contract(code=source)
	print("deploy transaction: %s" % tx_hash)

	transaction = _surety.wait(tx_hash, label="deploy")
	status = _surety.status_of(transaction)
	outcome = _surety.outcome_of(transaction)
	print("status: %s / outcome: %s" % (status, outcome))
	if status != "FINALIZED" or outcome not in AGREED:
		print("deploy did not finalise with validator agreement; nothing is written down.")
		return 2

	address = _surety.deployed_address(transaction)
	print("address in receipt: %s" % address)

	# Read the code back and compare. This is the check that matters: the address is only
	# recorded if the node is serving the file that is in this repository.
	on_chain = code_on_chain(conn, address)
	print("  on-chain bytes:  %d" % len(on_chain))
	print("  on-chain sha256: %s" % hashlib.sha256(on_chain).hexdigest())
	if on_chain != source_bytes:
		print("MISMATCH: the deployed code is not this file. Address NOT recorded.")
		return 4
	print("  identical to the repository file: yes")

	# Prove the contract answers before writing its address anywhere.
	stats = conn.read_contract(address=address, function_name="stats", args=[])
	print("stats(): %s" % stats)

	set_contract_in_env(address)
	print("contract address: %s" % address)
	print("recorded in %s as SURETY_CONTRACT" % _surety.ENV_FILE.name)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
