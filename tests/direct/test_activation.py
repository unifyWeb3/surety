"""Activation: the promise must be physically present in the source before ACTIVE.

Every refusal here is paired with a positive control driving the same code path to success
(the brief's rule 4: a refusal test without a positive control can pass for the wrong reason).
"""

from conftest import (
	PAGE,
	PAGE_BREACHED,
	PAGE_PROMISE_PLUS_BREACH,
	PROMISE,
	SOURCE,
	STRANGER,
	create,
	serve,
)

LITERAL_PRESENT = "literal-present:may increase the base transfer fee at any time"
SEMANTIC = "semantic: the page no longer states a base transfer fee of 0.10 percent"


def test_positive_control_then_the_refusal_beside_it(direct_vm, contract):
	"""The same call that is refused below can succeed -- so the refusals mean something."""
	cid = create(direct_vm, contract)
	assert contract.get_covenant(cid)["status"] == "AWAITING_ACTIVATION"
	assert contract.is_active(cid) is False

	serve(direct_vm, PAGE)
	direct_vm.sender = STRANGER  # activation is permissionless
	assert contract.activate(cid) == "ACTIVE"
	assert contract.is_active(cid) is True

	record = contract.get_covenant(cid)
	assert record["anchor_quote"] == PROMISE
	assert record["anchor_match"] == "VERBATIM"
	assert record["anchor_coverage_band"] == "COVERAGE_EXACT"
	assert len(record["anchor_digest"]) == 64
	assert record["activation_by"] == STRANGER
	assert record["activated_at"] != ""
	assert record["source_url"] == SOURCE


def test_refuses_a_fabricated_promise(direct_vm, contract):
	"""(A) The promise text is not in the page. (B) The same covenant does activate on a page it is in."""
	fabricated = "Acme Protocol commits to never raising the validator commission above one percent"
	cid = create(direct_vm, contract, promise_text=fabricated)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"
	assert contract.is_active(cid) is False
	record = contract.get_covenant(cid)
	assert record["anchor_quote"] == ""
	assert record["anchor_digest"] == ""
	assert record["activated_at"] == ""
	assert contract.stats()["activation_refusals"] == 1

	control = create(direct_vm, contract, label="control-fabricated", promise_text=PROMISE)
	serve(direct_vm, PAGE)
	assert contract.activate(control) == "ACTIVE"


def test_refuses_a_promise_about_the_wrong_subject(direct_vm, contract):
	cid = create(direct_vm, contract, subject="Globex Foundation")
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "REFUSED_SUBJECT_ABSENT"
	assert contract.is_active(cid) is False

	control = create(direct_vm, contract, label="right-subject", subject="Acme Protocol")
	serve(direct_vm, PAGE)
	assert contract.activate(control) == "ACTIVE"


def test_refuses_a_rule_that_already_fires(direct_vm, contract):
	"""A covenant may not start life already breached. Positive control: same rule, clean page."""
	bad = create(direct_vm, contract, label="already-broken", breach_rule=LITERAL_PRESENT)
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.activate(bad) == "REFUSED_ALREADY_IN_BREACH"
	assert contract.is_active(bad) is False

	good = create(direct_vm, contract, label="not-broken-yet", breach_rule=LITERAL_PRESENT)
	serve(direct_vm, PAGE)
	assert contract.activate(good) == "ACTIVE"


def test_a_changed_number_is_an_absent_promise_not_a_silent_pass(direct_vm, contract):
	"""The promised terms are gone from the page. The covenant refuses rather than going active."""
	cid = create(direct_vm, contract, label="terms-rewritten")
	serve(direct_vm, PAGE_BREACHED)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"
	assert contract.is_active(cid) is False


def test_refuses_an_unreachable_source(direct_vm, contract):
	cid = create(direct_vm, contract)
	serve(direct_vm, "gone", status=404)
	assert contract.activate(cid) == "REFUSED_SOURCE_UNREACHABLE"
	assert contract.is_active(cid) is False

	control = create(direct_vm, contract, label="reachable")
	serve(direct_vm, PAGE)
	assert contract.activate(control) == "ACTIVE"


def test_activation_cannot_run_twice(direct_vm, contract):
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"
	with direct_vm.expect_revert("not awaiting activation"):
		contract.activate(cid)


def test_activation_refuses_an_unknown_covenant(direct_vm, contract):
	with direct_vm.expect_revert("unknown covenant"):
		contract.activate("0" * 64)


def test_the_model_gate_is_independent_of_the_text_gate(direct_vm, contract):
	"""Either gate can refuse: the text is present, the model says the window does not assert it."""
	cid = create(direct_vm, contract, label="model-says-no")
	serve(direct_vm, PAGE, asserted=False)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"

	control = create(direct_vm, contract, label="model-says-yes")
	serve(direct_vm, PAGE, asserted=True)
	assert contract.activate(control) == "ACTIVE"


def test_semantic_rule_uses_the_model_and_a_supported_breach_now_blocks_activation(direct_vm, contract):
	blocked = create(direct_vm, contract, label="semantic-broken", breach_rule=SEMANTIC)
	serve(direct_vm, PAGE, asserted=True, breached_now=True)
	assert contract.activate(blocked) == "REFUSED_ALREADY_IN_BREACH"

	control = create(direct_vm, contract, label="semantic-ok", breach_rule=SEMANTIC)
	serve(direct_vm, PAGE, asserted=True, breached_now=False)
	assert contract.activate(control) == "ACTIVE"
	record = contract.get_covenant(control)
	assert record["breach_rule"] == SEMANTIC
	assert record["anchor_quote"] == PROMISE


def test_literal_rule_activation_needs_no_breach_model_call(direct_vm, contract):
	"""For a literal rule the breach half is deterministic: no breach_now mock is registered."""
	cid = create(direct_vm, contract, label="literal-no-model-breach")
	serve(direct_vm, PAGE)
	rec = contract.get_covenant(cid)
	assert rec["breach_rule"].startswith("literal-absent:")
	assert contract.activate(cid) == "ACTIVE"


def test_activation_records_only_verified_evidence(direct_vm, contract):
	"""The stored record has no model-authored prose anywhere: no rationale, basis or summary."""
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	contract.activate(cid)
	record = contract.get_covenant(cid)
	for forbidden in ("rationale", "basis", "summary", "explanation", "reasoning"):
		assert forbidden not in record
	assert set(record) == {
		"covenant_id",
		"owner",
		"label",
		"source_url",
		"subject",
		"promise_text",
		"breach_rule",
		"permitted_changes",
		"beneficiary",
		"beneficiary_is_owner",
		"bond_declared_atto",
		"bond_sent_atto",
		"absence_is_breach",
		"check_cooldown_seconds",
		"created_at",
		"status",
		"is_active",
		"is_breached",
		"anchor_quote",
		"anchor_digest",
		"anchor_text_digest",
		"anchor_match",
		"anchor_coverage_band",
		"activated_at",
		"activation_by",
		"last_check_seq",
		"last_check_at",
		"last_check_by",
		"last_check_verdict",
		"last_check_quote_present",
		"last_check_anchor_drifted",
		"last_check_evidence_digest",
		"last_check_text_digest",
		"last_check_rule_span",
		"breached_at",
	}
