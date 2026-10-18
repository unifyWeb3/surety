"""Generate a throwaway Studionet key into .env.surety and fund it from the Studio faucet.

The private key is written to a 0600 file that git ignores, and is never printed. Only the
address is echoed, because the address is the part you need to fund and to look up.

Usage:  python scripts/generate_key.py [--fund]
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _surety  # noqa: E402
from eth_account import Account  # noqa: E402

FAUCET_ATTO = 10**18  # 1 GEN, the amount sim_fundAccount's own examples use


def main() -> int:
	_surety.load_env()
	path = _surety.ENV_FILE

	if path.exists() and "--force" not in sys.argv:
		print(
			"%s already exists; not overwriting a key that may already hold a deployment. "
			"Pass --force to replace it." % path.name
		)
		address = _surety.address()
		print("address in the existing file: %s" % address)
		if "--fund" in sys.argv:
			fund(address)
		return 0

	account = Account.create()
	key = account.key.hex()
	if not key.startswith("0x"):
		key = "0x" + key

	path.write_text(
		"# Throwaway Studionet key for the Surety demo. Written by scripts/generate_key.py.\n"
		"# Gitignored (git check-ignore confirms) and never printed by any script here.\n"
		"SURETY_DEPLOYER_KEY=%s\n"
		"SURETY_RPC_URL=%s\n"
		"SURETY_CONTRACT=\n" % (key, _surety.DEFAULT_RPC)
	)
	os.chmod(path, 0o600)

	# Belt and braces: prove again, after writing, that this file cannot be committed.
	_surety.require_gitignored(path)
	mode = oct(path.stat().st_mode & 0o777)

	print("wrote %s (mode %s, ignored by git)" % (path.name, mode))
	print("address: %s" % account.address)
	print("the private key was written to that file and is intentionally not printed or logged")

	if "--fund" in sys.argv:
		fund(account.address)
	return 0


def fund(address: str) -> None:
	"""Ask Studio's own faucet for gas.

	genlayer-py's `fund_account` helper refuses any chain that is not localnet, so this calls the
	Studio RPC method directly and shows the node's raw answer rather than a summary of it.
	"""
	from genlayer_py import chains, create_client

	conn = create_client(chain=chains.studionet)
	response = conn.provider.make_request(
		method="sim_fundAccount",
		params=[address, FAUCET_ATTO],
	)
	print("sim_fundAccount(%s, %d atto) ->" % (address, FAUCET_ATTO))
	_surety.show(response)
	balance = conn.get_balance(address)
	print("balance now: %d atto (%s wei-GEN)" % (balance, balance))


if __name__ == "__main__":
	raise SystemExit(main())
