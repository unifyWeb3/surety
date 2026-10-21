"""Every activation refusal is terminal: there is no retry, and the page must say so.

The web page once told a reader that "retrying activation is allowed and costs nothing" and
offered the activate command for a refused covenant. The contract says otherwise, and these
tests are the proof the page is written against:

  * each of the four refusal statuses is produced by the real contract code path;
  * a second ``activate`` is refused by the contract's own guard, with the contract's own error;
  * nothing in the record changes after the refused call, and ``request_check`` is refused too;
  * a covenant whose promise really is in the source still activates through the same path, so
    the rejection cannot be passing for the wrong reason.
"""

from conftest import (
	PAGE,
	PAGE_PROMISE_PLUS_BREACH,
	PROMISE,
	STRANGER,
	create,
	serve,
)

FABRICATED = "Acme Protocol commits to never raising the validator commission above one percent"
LITERAL_PRESENT = "literal-present:may increase the base transfer fee at any time"
WRONG_SUBJECT = "Globex Foundation"

# The four statuses a refusal can leave, with the world that produces each one.
REFUSALS = [
	("REFUSED_PROMISE_ABSENT", {"promise_text": FABRICATED}, PAGE, 200),
	("REFUSED_SUBJECT_ABSENT", {"subject": WRONG_SUBJECT}, PAGE, 200),
	("REFUSED_ALREADY_IN_BREACH", {"breach_rule": LITERAL_PRESENT}, PAGE_PROMISE_PLUS_BREACH, 200),
	("REFUSED_SOURCE_UNREACHABLE", {}, "gone", 404),
]


def _make(direct_vm, contract, label, **over):
	return create(direct_vm, contract, label=label, **over)


def test_the_contract_defines_exactly_four_refusal_statuses(surety_mod):
	"""The set the web page must know about is read from the contract, not from memory."""
	refusals = {
		surety_mod.STATUS_REFUSED_ABSENT,
		surety_mod.STATUS_REFUSED_SUBJECT,
		surety_mod.STATUS_REFUSED_BREACH,
		surety_mod.STATUS_REFUSED_UNREACHABLE,
	}
	assert len(refusals) == 4
	assert refusals == {name for name, _, _, _ in REFUSALS}


def test_a_refused_covenant_cannot_be_activated_again(direct_vm, contract):
	"""A promise that is not in the source refuses, and the refusal is final."""
	cid = _make(direct_vm, contract, "refused-promise", promise_text=FABRICATED)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"

	before = contract.get_covenant(cid)
	stats_before = contract.stats()
	assert before["status"] == "REFUSED_PROMISE_ABSENT"
	assert before["is_active"] is False
	assert before["anchor_quote"] == ""
	assert before["anchor_digest"] == ""

	# The contract's own guard, with the contract's own words.
	with direct_vm.expect_revert("[EXPECTED] covenant is not awaiting activation"):
		contract.activate(cid)

	# Nothing moved: the refusal is a closed record, not a starting point.
	after = contract.get_covenant(cid)
	assert after == before
	assert contract.stats() == stats_before

	# And a check cannot be asked for either.
	with direct_vm.expect_revert("[EXPECTED] covenant is not active"):
		contract.request_check(cid)
	assert contract.get_covenant(cid) == before
	assert contract.stats() == stats_before


def test_the_positive_control_activates_through_the_same_path(direct_vm, contract):
	"""The same call, on a promise that really is in the source, succeeds."""
	cid = _make(direct_vm, contract, "control-promise")
	serve(direct_vm, PAGE)
	direct_vm.sender = STRANGER
	assert contract.activate(cid) == "ACTIVE"
	record = contract.get_covenant(cid)
	assert record["status"] == "ACTIVE"
	assert record["is_active"] is True
	assert record["anchor_quote"] == PROMISE
	assert len(record["anchor_digest"]) == 64
	assert record["activated_at"] != ""


def test_every_refusal_status_is_terminal(direct_vm, contract):
	"""All four refusals: produced for real, then refused on a second attempt, changing nothing."""
	for expected, over, body, status in REFUSALS:
		label = "terminal-" + expected.lower().replace("_", "-")
		cid = _make(direct_vm, contract, label, **over)
		serve(direct_vm, body, status=status)
		assert contract.activate(cid) == expected, expected

		before = contract.get_covenant(cid)
		stats_before = contract.stats()
		assert before["status"] == expected
		assert before["is_active"] is False
		assert before["is_breached"] is False
		assert before["anchor_quote"] == ""
		assert before["anchor_digest"] == ""
		assert before["last_check_seq"] == "0"

		with direct_vm.expect_revert("[EXPECTED] covenant is not awaiting activation"):
			contract.activate(cid)
		assert contract.get_covenant(cid) == before, expected
		assert contract.stats() == stats_before, expected

		with direct_vm.expect_revert("[EXPECTED] covenant is not active"):
			contract.request_check(cid)
		assert contract.get_covenant(cid) == before, expected
		assert contract.stats() == stats_before, expected


def test_a_refusal_costs_nothing_but_also_buys_nothing(direct_vm, contract):
	"""The refusal counter moves once; the refusal itself is not a recoverable state."""
	cid = _make(direct_vm, contract, "counter", promise_text=FABRICATED)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"
	assert contract.stats()["activation_refusals"] == 1

	with direct_vm.expect_revert("[EXPECTED] covenant is not awaiting activation"):
		contract.activate(cid)
	# The refused call is not even counted: it never reached the refusal path.
	assert contract.stats()["activation_refusals"] == 1
	assert contract.get_covenant(cid)["status"] == "REFUSED_PROMISE_ABSENT"


def test_only_a_new_covenant_can_move_on_from_a_refusal(direct_vm, contract):
	"""The way forward the page offers: a new covenant, with a promise that is in the source."""
	refused = _make(direct_vm, contract, "first-attempt", promise_text=FABRICATED)
	serve(direct_vm, PAGE)
	assert contract.activate(refused) == "REFUSED_PROMISE_ABSENT"

	# The refused covenant stays refused while a new one is written and proved.
	serve(direct_vm, PAGE)
	fresh = _make(direct_vm, contract, "second-attempt")
	assert contract.activate(fresh) == "ACTIVE"
	assert contract.get_covenant(fresh)["status"] == "ACTIVE"
	assert contract.get_covenant(refused)["status"] == "REFUSED_PROMISE_ABSENT"
	assert contract.get_covenant(fresh)["covenant_id"] != refused
