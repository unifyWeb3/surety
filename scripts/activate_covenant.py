"""Ask the contract to prove a covenant's promise is present in its pinned source.

Anyone may run this; the covenant supplies the URL, the subject and the rules, so the caller
cannot steer the outcome. On success the covenant becomes ACTIVE and its anchor quote and digest
are recorded. On refusal it is refused, permanently, and the reason is a status.

Usage:  python scripts/activate_covenant.py --id <covenant id>
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
	_surety.write("activate", [args.id], label="activate")

	covenant = _surety.read("get_covenant", [args.id]) or {}
	print("")
	print("status: %s" % covenant.get("status"))
	print("anchor_quote: %s" % covenant.get("anchor_quote"))
	print("anchor_digest: %s" % covenant.get("anchor_digest"))
	print("anchor_match: %s (coverage %s)" % (covenant.get("anchor_match"), covenant.get("anchor_coverage_band")))
	print("activated_by: %s" % covenant.get("activation_by"))
	print("activated_at: %s" % covenant.get("activated_at"))
	if covenant.get("status") == "ACTIVE":
		print("")
		print("next: python scripts/request_check.py --id %s" % args.id)
	return 0 if covenant.get("status") == "ACTIVE" else 1


if __name__ == "__main__":
	raise SystemExit(main())
