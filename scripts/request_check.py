"""Trigger a re-check of an active covenant and print the verdict the validators agreed on.

Permissionless and rate limited by the covenant's own cooldown. The caller supplies nothing but
the id: no URL, no quote, no rule. A BREACH verdict is permanent.

Usage:  python scripts/request_check.py --id <covenant id>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _surety  # noqa: E402


def main() -> int:
	_surety.load_env()
	parser = argparse.ArgumentParser()
	parser.add_argument("--id", required=True)
	args = parser.parse_args()

	print("caller: %s" % _surety.address())
	print("covenant: %s" % args.id)
	_surety.write("request_check", [args.id], label="request_check")

	covenant = _surety.read("get_covenant", [args.id]) or {}
	print("")
	print("status: %s" % covenant.get("status"))
	print("check seq: %s at %s by %s" % (
		covenant.get("last_check_seq"),
		covenant.get("last_check_at"),
		covenant.get("last_check_by"),
	))
	print("verdict: %s" % covenant.get("last_check_verdict"))
	print("quote still present: %s" % covenant.get("last_check_quote_present"))
	print("anchor drifted: %s" % covenant.get("last_check_anchor_drifted"))
	print("evidence digest: %s" % covenant.get("last_check_evidence_digest"))
	print("rule span: %s" % covenant.get("last_check_rule_span"))
	if covenant.get("breached_at"):
		print("breached at: %s" % covenant.get("breached_at"))
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
