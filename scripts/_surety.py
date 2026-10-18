"""Shared plumbing for the Surety command-line scripts.

Two rules this module exists to enforce:

  * the throwaway testnet key lives in ``.env.surety``, which is gitignored, and is never
    printed, logged or echoed -- scripts here print addresses only; and
  * every transaction waits at most two minutes before giving up and saying so, rather than
    polling forever.

Neither the key nor any RPC secret ever reaches a file that git tracks; ``require_gitignored``
checks that at run time instead of trusting the .gitignore to still be right.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from genlayer_py import chains, create_account, create_client

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.surety"
DEFAULT_RPC = "https://studio.genlayer.com/api"

# 3s * 40 = 120s. The brief's ceiling, made explicit so nobody raises it by accident.
WAIT_INTERVAL_MS = 3000
WAIT_RETRIES = 40

# Decided states. A transaction that reaches one of these will not change again of its own
# accord, so polling can stop. UNDETERMINED is a real outcome, not a synonym for success: the
# validators reached no agreement, and a script that treated it as success would be lying.
DECIDED = {
	"FINALIZED",
	"ACCEPTED",
	"UNDETERMINED",
	"CANCELED",
	"LEADER_TIMEOUT",
	"VALIDATORS_TIMEOUT",
}

# Outcomes that mean the validators agreed with each other. Anything else (NO_MAJORITY,
# MAJORITY_DISAGREE, TIMEOUT) is a failure of consensus, not a result.
AGREED = {"MAJORITY_AGREE", "MAJORITY_AGREEMENT", "AGREE"}

# States that mean the round is settled. ACCEPTED is the ordinary stopping point for a
# non-appealable round: the validators have agreed and nothing further can change the result.
SUCCESS_STATES = {"ACCEPTED", "READY_TO_FINALIZE", "FINALIZED"}


def load_env() -> None:
	"""Load .env.surety, after proving git cannot see it."""
	if ENV_FILE.exists():
		require_gitignored(ENV_FILE)
		load_dotenv(ENV_FILE, override=False)


def require_gitignored(path: Path) -> None:
	"""Refuse to continue if a file holding a key is not ignored by git."""
	try:
		result = subprocess.run(
			["git", "check-ignore", "--quiet", str(path)],
			cwd=str(ROOT),
			capture_output=True,
			check=False,
		)
	except FileNotFoundError:  # git absent: do not silently continue
		raise SystemExit("git is not available, so it cannot be proven that %s is ignored" % path.name)
	if result.returncode != 0:
		raise SystemExit(
			"refusing to run: %s is NOT ignored by git (git check-ignore said so)" % path
		)


def rpc_url() -> str:
	return os.environ.get("SURETY_RPC_URL", DEFAULT_RPC)


def account():
	key = os.environ.get("SURETY_DEPLOYER_KEY", "").strip()
	if key == "":
		raise SystemExit(
			"no SURETY_DEPLOYER_KEY. Generate one with scripts/generate_key.py; it is written to "
			"%s, which git ignores." % ENV_FILE.name
		)
	return create_account(key)


def address() -> str:
	return account().address


def client(account_to_use=None):
	from genlayer_py import create_client as _create_client

	return _create_client(chain=chains.studionet, account=account_to_use or account())


def contract_address() -> str:
	value = os.environ.get("SURETY_CONTRACT", "").strip()
	if len(value) != 42 or not value.startswith("0x"):
		raise SystemExit(
			"no contract address. Set SURETY_CONTRACT in %s to the deployed address." % ENV_FILE.name
		)
	return value


def status_of(transaction: dict) -> str:
	"""Return the readable status.

	The receipt carries both a numeric ``status`` and a ``status_name``. They are not the same
	numbering: numeric 7 came back on a receipt whose ``status_name`` was FINALIZED, so the
	numeric field is not trusted for anything.
	"""
	return str(transaction.get("status_name") or transaction.get("status") or "UNKNOWN")


def outcome_of(transaction: dict) -> str:
	"""Return MAJORITY_AGREE / NO_MAJORITY / ... for an execution round."""
	return str(transaction.get("result_name") or transaction.get("result") or "UNKNOWN")


def wait(tx_hash: Any, label: str = "transaction") -> dict:
	"""Poll a transaction to a decided state, for at most two minutes.

	Polling is done by hand rather than through the SDK's ``wait_for_transaction_receipt`` so the
	ceiling is explicit and the last observed status is reported instead of a stack trace.
	"""
	conn = client()
	deadline = time.monotonic() + (WAIT_INTERVAL_MS * WAIT_RETRIES) / 1000.0
	seen = "UNKNOWN"
	while True:
		transaction = conn.get_transaction(transaction_hash=tx_hash)
		if transaction is not None:
			seen = status_of(transaction)
			if seen in DECIDED:
				return transaction
		if time.monotonic() >= deadline:
			print(
				"[timeout] %s %s did not decide within 120s (last status %s). "
				"This is reported, not hidden: the transaction may still finalise later."
				% (label, tx_hash, seen),
				file=sys.stderr,
			)
			raise SystemExit(3)
		time.sleep(WAIT_INTERVAL_MS / 1000.0)


def deployed_address(transaction: dict) -> str:
	"""Find the new contract address in a deploy receipt.

	On GenLayer a deploy is sent to the address the contract will occupy, so ``to_address`` (and
	its alias ``recipient``) is the new contract. Every candidate is checked by reading a view on
	it before it is trusted; see ``scripts/deploy.py``.
	"""
	for key in ("to_address", "recipient", "contract_address", "contractAddress"):
		value = transaction.get(key)
		if isinstance(value, str) and value.startswith("0x") and len(value) == 42:
			return value
	raise SystemExit(
		"could not find a contract address in the receipt. Keys present: %s"
		% sorted(transaction.keys())
	)


def read(function_name: str, args: list | None = None) -> object:
	"""Call a view on the deployed Surety contract."""
	return client().read_contract(
		address=contract_address(),
		function_name=function_name,
		args=args or [],
	)


def write(function_name: str, args: list, value: int = 0, label: str | None = None) -> dict:
	"""Send a write to the deployed contract and wait for it, reporting the consensus honestly.

	Prints the transaction hash, the status, the outcome (MAJORITY_AGREE and friends) and each
	validator's vote, so a reader can see whether the validators actually agreed rather than
	taking the script's word for it.
	"""
	conn = client()
	tx_hash = conn.write_contract(
		address=contract_address(),
		function_name=function_name,
		value=value,
		args=args,
	)
	print("%s transaction: %s" % (label or function_name, tx_hash))

	transaction = wait(tx_hash, label=label or function_name)
	status = status_of(transaction)
	outcome = outcome_of(transaction)
	print("status: %s / outcome: %s" % (status, outcome))
	print_votes(transaction)

	if status not in SUCCESS_STATES or outcome not in AGREED:
		print(
			"the validators did not finalise this with agreement, so nothing about it is treated "
			"as a result. The receipt is above."
		)
		raise SystemExit(5)
	return transaction


def print_votes(transaction: dict) -> None:
	"""Print how each validator voted, without dumping the whole receipt."""
	receipts = ((transaction.get("consensus_data") or {}).get("validators")) or []
	for index, receipt in enumerate(receipts):
		if not isinstance(receipt, dict):
			continue
		result = receipt.get("execution_result")
		vote = receipt.get("vote")
		detail = ""
		genvm = receipt.get("genvm_result") or {}
		if isinstance(genvm, dict):
			raw = genvm.get("raw_error") or {}
			if isinstance(raw, dict) and raw.get("causes"):
				detail = " (%s)" % ",".join(str(c) for c in raw["causes"])
		print("  validator %d: %s vote=%s%s" % (index, result, vote, detail))


def show(value: Any) -> None:
	print(json.dumps(value, indent=2, sort_keys=True, default=str))
