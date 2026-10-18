"""Prove, from the node, that the deployed code is byte-for-byte the file in this repository.

Run this any time: it is the evidence behind the claim in the README. It reads the code back with
gen_getContractCode, base64-decodes it, and compares sha256 with contracts/surety.py.

Usage:  python scripts/verify_code.py [--address 0x...]
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _surety  # noqa: E402

CONTRACT = _surety.ROOT / "contracts" / "surety.py"


def main() -> int:
	_surety.load_env()
	parser = argparse.ArgumentParser()
	parser.add_argument("--address", default=None)
	args = parser.parse_args()

	address = args.address or _surety.contract_address()
	repo_bytes = CONTRACT.read_text().encode()

	conn = _surety.client()
	response = conn.provider.make_request(method="gen_getContractCode", params=[address])
	on_chain = base64.b64decode(response["result"])

	repo_digest = hashlib.sha256(repo_bytes).hexdigest()
	chain_digest = hashlib.sha256(on_chain).hexdigest()

	print("address:     %s" % address)
	print("repo file:   %s" % CONTRACT)
	print("  bytes:     %d" % len(repo_bytes))
	print("  sha256:    %s" % repo_digest)
	print("on chain:    gen_getContractCode (base64), decoded")
	print("  bytes:     %d" % len(on_chain))
	print("  sha256:    %s" % chain_digest)
	print("identical:   %s" % ("yes" if on_chain == repo_bytes else "NO"))
	return 0 if on_chain == repo_bytes else 4


if __name__ == "__main__":
	raise SystemExit(main())
