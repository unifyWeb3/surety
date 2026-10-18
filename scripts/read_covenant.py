"""Read a covenant straight off the chain and print every field a reader is entitled to see.

This is the same data the web page renders, from the same contract, with nothing added.

Usage:  python scripts/read_covenant.py --id <covenant id>
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

	covenant = _surety.read("get_covenant", [args.id])
	if not covenant:
		print("no covenant with that id is stored")
		return 1
	_surety.show(covenant)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
