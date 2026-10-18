"""Shared fixtures for the Surety direct-mode suite. No network anywhere.

Direct mode runs the leader only -- the validator function is not executed by the harness. That is
why every comparison rule lives in a module-level pure function, and why tests that need the real
validator use ``direct_vm.run_validator()``: the harness captures the validator closure from the
``gl.vm.run_nondet`` call and will run it against whatever mocks are installed at that moment.
Swapping mocks between the contract call and ``run_validator()`` is exactly how "the validator saw
different bytes" is tested here.
"""

import re
import sys
from pathlib import Path

import pytest
from gltest.direct import pytest_plugin  # noqa: F401  (registers the direct_* fixtures)

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "contracts"))

CONTRACT = "contracts/surety.py"

# The GenVM bundle gltest extracted under ~/.cache/gltest-direct, pinned so a differently-named
# bundle dropped into the same cache by a linter run cannot change what these tests execute.
SDK_VERSION = "v0.2.16"

OWNER = "0x" + "a1" * 20
STRANGER = "0x" + "b2" * 20
BENEFICIARY = "0x" + "c3" * 20
SPENDER = "0x" + "d4" * 20

SOURCE = "https://surety.test/terms"
PAGE = (
	"Acme Protocol Terms of Service. "
	"Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2030. "
	"Fees are reviewed annually. "
	"Acme Protocol may change documentation formatting at any time. "
)
PROMISE = "Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2030"

# A page where the promise has been replaced by its opposite.
PAGE_BREACHED = PAGE.replace(
	"at 0.10 percent until 2030", "at 0.50 percent and may increase at any time"
)

# A page where the promise sentence is gone but the rest of the site is untouched.
PAGE_PROMISE_REMOVED = PAGE.replace(
	"Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2030. ", ""
)

# The promise sentence is still there AND a sentence the owner forbade has appeared.
FORBIDDEN = "Acme Protocol may increase the base transfer fee at any time"
PAGE_PROMISE_PLUS_BREACH = PAGE + FORBIDDEN + ". "

COOLDOWN = "60"

# Prompt markers. These are substrings of the prompts the contract builds, so a mock that matches
# one of them can only be hit if the contract really asked that question.
P_ASSERTED = r"Set asserted:"
P_ACTIVATION_BREACH = r"already breaks one rule"
P_CHECK_BREACH = r"shows the RULE is currently broken"


@pytest.fixture
def contract(direct_deploy):
	return direct_deploy(CONTRACT, sdk_version=SDK_VERSION)


@pytest.fixture
def surety_mod(contract):
	"""The module the direct-mode loader already executed for this test.

	Importing ``contracts/surety.py`` a second time under a different module name would create a
	second ``gl.Contract`` subclass in the same process, and GenVM rejects that outright, so the
	pure helpers are reached through the module the loader registered.
	"""
	mod = sys.modules.get("_contract_surety")
	if mod is None:
		raise AssertionError("direct-mode loader did not register _contract_surety")
	return mod


def url_pattern(url: str) -> str:
	return "^" + re.escape(url) + "$"


def mock_page(direct_vm, body: str, status: int = 200, url: str = SOURCE) -> None:
	direct_vm.mock_web(url_pattern(url), {"status": status, "body": body})


def mock_llm(direct_vm, pattern: str, reply: str) -> None:
	direct_vm.mock_llm(pattern, reply)


def serve(
	direct_vm,
	body: str,
	status: int = 200,
	asserted: bool = True,
	breached_now: bool = False,
	breached=None,
	span: str = "",
	url: str = SOURCE,
) -> None:
	"""Install exactly the mocks for ONE observed world state.

	Clears every mock first, so a test that changes the world between two calls cannot silently
	keep serving the old bytes -- ``_match_web_mock`` returns the first registered match.
	"""
	direct_vm.clear_mocks()
	mock_page(direct_vm, body, status=status, url=url)
	mock_llm(direct_vm, P_ASSERTED, '{"asserted": %s}' % ("true" if asserted else "false"))
	mock_llm(direct_vm, P_ACTIVATION_BREACH, '{"breached_now": %s}' % ("true" if breached_now else "false"))
	if breached is not None:
		mock_llm(
			direct_vm,
			P_CHECK_BREACH,
			'{"breached": %s, "span": %s}' % ("true" if breached else "false", _json_str(span)),
		)


def message_datetime() -> str:
	"""The contract-visible transaction time, i.e. ``gl.message_raw["datetime"]``."""
	import genlayer.gl as gl

	return gl.message_raw["datetime"]


def advance(direct_vm, seconds: int) -> None:
	"""Move the contract-visible transaction time forward.

	``VMContext.warp`` refreshes ``gl.message`` and the sender fields of ``gl.message_raw``, but
	it does not touch ``gl.message_raw["datetime"]``, and ``gl.message`` has no datetime field at
	all -- so in direct mode a warp alone changes nothing a contract can read. This sets the same
	field the SDK exposes and that the contract reads. It is the identical mutation the harness
	performs for the sender, done by hand for the one field it skips.
	"""
	from datetime import datetime, timedelta

	import genlayer.gl as gl

	moment = datetime.fromisoformat(message_datetime()) + timedelta(seconds=seconds)
	gl.message_raw["datetime"] = moment.isoformat()
	direct_vm._datetime = gl.message_raw["datetime"]


def _json_str(value: str) -> str:
	import json

	return json.dumps(value)


def create(direct_vm, contract, **over):
	"""Create a covenant with sane defaults. Overrides are applied verbatim."""
	direct_vm.sender = over.pop("sender", OWNER)
	args = {
		"label": "acme-fees",
		"source_url": SOURCE,
		"subject": "Acme Protocol",
		"promise_text": PROMISE,
		"breach_rule": "literal-absent:base transfer fee at 0.10 percent",
		"permitted_changes": "documentation formatting",
		"beneficiary": BENEFICIARY,
		"bond_declared_atto": "1000000000000000000",
		"absence_is_breach": True,
		"check_cooldown_seconds": COOLDOWN,
	}
	args.update(over)
	return contract.create_covenant(**args)


def active_covenant(direct_vm, contract, **over):
	"""Create and activate, returning the covenant id. Refuses quietly if it did not activate."""
	cid = create(direct_vm, contract, **over)
	serve(direct_vm, PAGE)
	direct_vm.sender = STRANGER
	status = contract.activate(cid)
	if status != "ACTIVE":
		raise AssertionError("fixture expected activation, got %r" % status)
	return cid
