"""Re-checks: anybody may ask, the owner's own rule decides, a breach is permanent."""

from conftest import (
	FORBIDDEN,
	advance,
	PAGE,
	PAGE_PROMISE_PLUS_BREACH,
	PAGE_PROMISE_REMOVED,
	SPENDER,
	STRANGER,
	active_covenant,
	create,
	serve,
)

PRESENT_RULE = "literal-present:" + FORBIDDEN


def test_positive_control_no_breach_then_breach(direct_vm, contract):
	cid = active_covenant(direct_vm, contract, breach_rule="literal-absent:base transfer fee at 0.10 percent")

	# (A) The promise is intact: NO_BREACH, the covenant stays ACTIVE.
	serve(direct_vm, PAGE)
	direct_vm.sender = SPENDER
	assert contract.request_check(cid) == "NO_BREACH"
	record = contract.get_covenant(cid)
	assert record["status"] == "ACTIVE"
	assert record["last_check_verdict"] == "NO_BREACH"
	assert record["last_check_quote_present"] is True
	assert record["last_check_anchor_drifted"] is False
	assert record["last_check_seq"] == "1"
	assert record["last_check_by"] == SPENDER
	assert contract.stats()["checks"] == 1


def test_breach_is_detected_recorded_and_permanent(direct_vm, contract):
	"""Rule: the owner promises a sentence never appears. It appears. Then nothing can undo it."""
	cid = active_covenant(direct_vm, contract, breach_rule=PRESENT_RULE)

	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"

	advance(direct_vm, 61)
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.request_check(cid) == "BREACH"
	record = contract.get_covenant(cid)
	assert record["status"] == "BREACHED"
	assert record["is_breached"] is True
	assert record["breached_at"] != ""
	assert contract.stats()["breaches"] == 1

	# Terminal: a later good page cannot clear it, and no call may overwrite the verdict.
	advance(direct_vm, 600)
	serve(direct_vm, PAGE)
	with direct_vm.expect_revert("not active"):
		contract.request_check(cid)
	assert contract.get_covenant(cid)["status"] == "BREACHED"


def test_promise_removed_is_a_breach_when_absence_is_breach(direct_vm, contract):
	cid = active_covenant(direct_vm, contract, absence_is_breach=True)
	serve(direct_vm, PAGE_PROMISE_REMOVED)
	assert contract.request_check(cid) == "BREACH"
	record = contract.get_covenant(cid)
	assert record["status"] == "BREACHED"
	assert record["last_check_quote_present"] is False
	assert record["last_check_evidence_digest"] == ""


def test_promise_removed_is_not_a_breach_when_the_owner_says_so(direct_vm, contract):
	"""The same page as above, with the owner's own escape clause: stays ACTIVE, verdict recorded."""
	cid = active_covenant(direct_vm, contract, label="removal-ok", absence_is_breach=False)
	serve(direct_vm, PAGE_PROMISE_REMOVED)
	assert contract.request_check(cid) == "PROMISE_ABSENT"
	record = contract.get_covenant(cid)
	assert record["status"] == "ACTIVE"
	assert record["last_check_verdict"] == "PROMISE_ABSENT"
	assert record["last_check_quote_present"] is False


def test_a_drifted_evidence_region_is_reported(direct_vm, contract):
	"""The promise is still there but its wording changed, so the anchor no longer matches."""
	cid = active_covenant(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"

	advance(direct_vm, 61)
	drifted = PAGE.replace(
		"Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2030",
		"Acme Protocol commits to keeping the base transfer fee at 0.10 percent until 2031",
	)
	serve(direct_vm, drifted)
	assert contract.request_check(cid) == "NO_BREACH"
	record = contract.get_covenant(cid)
	assert record["last_check_quote_present"] is True
	assert record["last_check_anchor_drifted"] is True
	assert record["last_check_evidence_digest"] != record["anchor_digest"]


def test_cooldown_actually_gates_and_then_lets_go(direct_vm, contract):
	cid = active_covenant(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"

	# Refusal: a second check inside the window.
	with direct_vm.expect_revert("cooldown has not elapsed"):
		contract.request_check(cid)
	assert contract.get_covenant(cid)["last_check_seq"] == "1"

	# Positive control: the same call one second past the window is accepted.
	advance(direct_vm, 61)
	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"
	assert contract.get_covenant(cid)["last_check_seq"] == "2"


def test_unreachable_source_does_not_create_a_breach(direct_vm, contract):
	cid = active_covenant(direct_vm, contract)
	serve(direct_vm, "nope", status=500)
	assert contract.request_check(cid) == "UNREACHABLE"
	record = contract.get_covenant(cid)
	assert record["status"] == "ACTIVE"
	assert record["last_check_verdict"] == "UNREACHABLE"
	assert record["last_check_evidence_digest"] == ""

	# Positive control: the same covenant still decides normally afterwards.
	advance(direct_vm, 61)
	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"


def test_semantic_breach_stores_a_span_and_rejects_a_span_that_is_not_in_the_source(direct_vm, contract):
	rule = "semantic: the page no longer commits to the 0.10 percent base transfer fee"
	cid = active_covenant(direct_vm, contract, breach_rule=rule)

	# A model that invents a span the page does not contain is an error, not a stored fact.
	serve(
		direct_vm,
		PAGE,
		breached=True,
		span="a sentence that is nowhere on this page",
	)
	direct_vm.clear_validators()
	with direct_vm.expect_revert("rule span is not in the source"):
		contract.request_check(cid)

	# Positive control: a span that IS on the page is stored verbatim.
	direct_vm.clear_validators()
	serve(direct_vm, PAGE, breached=True, span="Fees are reviewed annually")
	assert contract.request_check(cid) == "BREACH"
	record = contract.get_covenant(cid)
	assert record["status"] == "BREACHED"
	assert record["last_check_rule_span"] == "Fees are reviewed annually"


def test_no_breach_never_stores_a_span(direct_vm, contract):
	rule = "semantic: the page no longer commits to the 0.10 percent base transfer fee"
	cid = active_covenant(direct_vm, contract, breach_rule=rule)
	serve(direct_vm, PAGE, breached=False, span="Fees are reviewed annually")
	assert contract.request_check(cid) == "NO_BREACH"
	assert contract.get_covenant(cid)["last_check_rule_span"] == ""


def test_checks_are_refused_on_the_wrong_state_and_on_unknown_ids(direct_vm, contract):
	awaiting = create(direct_vm, contract, label="not-yet")
	serve(direct_vm, PAGE)
	with direct_vm.expect_revert("not active"):
		contract.request_check(awaiting)
	with direct_vm.expect_revert("unknown covenant"):
		contract.request_check("0" * 64)
	assert contract.stats()["checks"] == 0

	cid = active_covenant(direct_vm, contract, label="activated")
	serve(direct_vm, PAGE)
	direct_vm.sender = STRANGER
	assert contract.request_check(cid) == "NO_BREACH"
	assert contract.get_covenant(cid)["last_check_by"] == STRANGER
