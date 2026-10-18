"""Register a covenant on the deployed Surety contract.

This is the command the compose page hands out; the flag names match it exactly.

Usage:
  python scripts/create_covenant.py \
    --label 'release discipline' \
    --source-url 'https://example.org/terms' \
    --subject 'the v2 release notes' \
    --promise 'no release ships without a signed migration note' \
    --rule 'literal-absent:deprecated' \
    --permitted 'copy edits, whitespace, and corrections of fact' \
    --beneficiary 0x0000000000000000000000000000000000000000 \
    --bond 0 \
    --cooldown 3600 \
    --absence-is-breach

Add --value-atto N to attach native value; the contract records it in bond_sent_atto.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _surety  # noqa: E402


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Create a Surety covenant.")
	parser.add_argument("--label", required=True)
	parser.add_argument("--source-url", required=True, dest="source_url")
	parser.add_argument("--subject", required=True)
	parser.add_argument("--promise", required=True)
	parser.add_argument("--rule", required=True)
	parser.add_argument("--permitted", required=True)
	parser.add_argument("--beneficiary", required=True)
	parser.add_argument("--bond", required=True, help="the bond the owner declares, in atto")
	parser.add_argument("--cooldown", required=True, help="seconds between checks")
	parser.add_argument("--value-atto", default="0", dest="value_atto")
	group = parser.add_mutually_exclusive_group(required=True)
	group.add_argument("--absence-is-breach", action="store_true", dest="absence_is_breach")
	group.add_argument("--absence-is-not-breach", action="store_false", dest="absence_is_breach")
	return parser.parse_args()


def main() -> int:
	_surety.load_env()
	args = parse_args()
	owner = _surety.address()

	print("owner (the address that will own this covenant): %s" % owner)
	print("source url: %s" % args.source_url)
	print("rule: %s" % args.rule)
	print("bond declared: %s atto; value attached: %s atto" % (args.bond, args.value_atto))

	_surety.write(
		"create_covenant",
		[
			args.label,
			args.source_url,
			args.subject,
			args.promise,
			args.rule,
			args.permitted,
			args.beneficiary,
			args.bond,
			args.absence_is_breach,
			args.cooldown,
		],
		value=int(args.value_atto),
		label="create_covenant",
	)

	# The id is read back from the chain rather than recomputed here, so the id printed is the
	# one the contract actually derived.
	covenants = _surety.read("list_covenants", [owner]) or []
	match = [c for c in covenants if c.get("label") == args.label]
	if not match:
		print("created, but no covenant with that label is readable back; not claiming an id.")
		return 1
	covenant = match[-1]
	print("")
	print("covenant id: %s" % covenant["covenant_id"])
	print("status: %s" % covenant["status"])
	print("bond_sent_atto: %s" % covenant["bond_sent_atto"])
	print("")
	print("next: python scripts/activate_covenant.py --id %s" % covenant["covenant_id"])
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
