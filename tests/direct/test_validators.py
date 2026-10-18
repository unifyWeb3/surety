"""Validator rules, exercised for real.

Direct mode captures the validator closure from each ``gl.vm.run_nondet`` call; ``run_validator``
runs it with whatever mocks are installed at that moment. That is how "the validator saw different
bytes" and "the leader reported something it did not compute" are tested here rather than argued
about. Each comparison is also driven directly as a pure function, so a specific field can be
falsified on its own.
"""

import pytest
from conftest import PAGE, PAGE_BREACHED, PROMISE, create, serve

# --------------------------------------------------------------------------- real validator runs


def test_validator_agrees_when_it_sees_the_same_page(direct_vm, contract):
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"
	# Same world, validator re-fetches: agree.
	serve(direct_vm, PAGE)
	assert direct_vm.run_validator() is True


def test_validator_rejects_when_its_own_fetch_differs(direct_vm, contract):
	"""The leader saw the promise; the validator's fetch does not contain it. No agreement."""
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	serve(direct_vm, PAGE_BREACHED)
	assert direct_vm.run_validator() is False


def test_validator_rejects_a_fabricated_quote(direct_vm, contract):
	"""A leader that reports a quote the page does not contain is rejected on the substring test."""
	import sys

	mod = sys.modules["_contract_surety"]
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	fabricated = "Acme Protocol commits to keeping the base transfer fee at 0.05 percent"
	forged = {
		"status": "ACTIVATED",
		"quote": fabricated,
		"evidence_digest": mod.digest_of(fabricated),
		"match": "VERBATIM",
		"coverage_band": "COVERAGE_EXACT",
		"subject_present": True,
		"asserted": True,
		"no_breach_now": True,
	}
	assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_a_self_inconsistent_digest(direct_vm, contract):
	"""Even a quote that IS on the page fails if the reported digest is not its digest."""
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	forged = {
		"status": "ACTIVATED",
		"quote": PROMISE,
		"evidence_digest": "0" * 64,
		"match": "VERBATIM",
		"coverage_band": "COVERAGE_EXACT",
		"subject_present": True,
		"asserted": True,
		"no_breach_now": True,
	}
	assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_a_leader_that_claims_no_breach_when_its_own_rule_fires(direct_vm, contract):
	cid = create(
		direct_vm,
		contract,
		breach_rule="literal-present:may increase the base transfer fee at any time",
	)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	forged = {
		"status": "ACTIVATED",
		"quote": PROMISE,
		"evidence_digest": __import__("sys").modules["_contract_surety"].digest_of(PROMISE),
		"match": "VERBATIM",
		"coverage_band": "COVERAGE_EXACT",
		"subject_present": True,
		"asserted": True,
		"no_breach_now": True,
	}
	# The validator's own fetch has the forbidden sentence, so its own no_breach_now is False.
	serve(direct_vm, PAGE + "Acme Protocol may increase the base transfer fee at any time. ")
	assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_agrees_on_a_refusal_it_also_computes(direct_vm, contract):
	"""A refusal is agreed by status equality: the validator must not accept a refusal it disagrees with."""
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE_BREACHED)
	assert contract.activate(cid) == "REFUSED_PROMISE_ABSENT"
	serve(direct_vm, PAGE_BREACHED)
	assert direct_vm.run_validator() is True
	serve(direct_vm, PAGE)
	assert direct_vm.run_validator() is False


def test_check_validator_agrees_and_can_disagree(direct_vm, contract):
	cid = create(direct_vm, contract)
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"
	serve(direct_vm, PAGE)
	assert direct_vm.run_validator() is True
	# The world changed between the leader's fetch and the validator's: the two do agree here,
	# because both are NO_BREACH -- so pick a case where they genuinely differ.
	serve(direct_vm, PAGE_BREACHED)
	assert direct_vm.run_validator() is False


# --------------------------------------------------------------------------- pure comparison units


def test_compare_activation_requires_exact_equality_on_every_evidence_field(surety_mod):
	good = {
		"status": "ACTIVATED",
		"quote": PROMISE,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"match": "VERBATIM",
		"coverage_band": "COVERAGE_EXACT",
		"subject_present": True,
		"asserted": True,
		"no_breach_now": True,
	}
	assert surety_mod.compare_activation(good, dict(good)) is True
	for field, wrong in (
		("quote", PROMISE + " and more"),
		("evidence_digest", "1" * 64),
		("match", "EQUIVALENT"),
		("coverage_band", "COVERAGE_GE_0_90"),
		("status", "REFUSED_PROMISE_ABSENT"),
		("asserted", False),
		("no_breach_now", False),
		("subject_present", False),
	):
		other = dict(good)
		other[field] = wrong
		assert surety_mod.compare_activation(good, other) is False, field
	assert surety_mod.compare_activation("not a dict", good) is False


def test_compare_activation_ignores_extra_leader_fields_but_still_checks_the_core(surety_mod):
	leader = {
		"status": "ACTIVATED",
		"quote": PROMISE,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"match": "VERBATIM",
		"coverage_band": "COVERAGE_EXACT",
		"subject_present": True,
		"asserted": True,
		"no_breach_now": True,
		"confidence": 0.99,
	}
	own = dict(leader)
	assert surety_mod.compare_activation(leader, own) is True


def test_compare_check_requires_a_findable_span_for_a_breach(surety_mod):
	text = surety_mod.normalize_text(PAGE)
	own = {
		"verdict": "BREACH",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "Fees are reviewed annually",
		"text": text,
	}
	assert surety_mod.compare_check(own, own) is True

	not_on_page = dict(own)
	not_on_page["rule_span"] = "a sentence that is nowhere on this page"
	assert surety_mod.compare_check(not_on_page, own) is False

	too_long = dict(own)
	too_long["rule_span"] = "x" * 401
	assert surety_mod.compare_check(too_long, own) is False

	empty = dict(own)
	empty["rule_span"] = ""
	assert surety_mod.compare_check(empty, own) is False


def test_compare_check_rejects_a_span_on_a_no_breach_verdict(surety_mod):
	own = {
		"verdict": "NO_BREACH",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "",
		"text": surety_mod.normalize_text(PAGE),
	}
	assert surety_mod.compare_check(own, own) is True
	smuggled = dict(own)
	smuggled["rule_span"] = "Fees are reviewed annually"
	assert surety_mod.compare_check(smuggled, own) is False


def test_compare_check_covers_every_verdict_field(surety_mod):
	own = {
		"verdict": "PROMISE_ABSENT",
		"quote_present": False,
		"anchor_drifted": False,
		"evidence_digest": "",
		"subject_present": False,
		"rule_span": "",
		"text": surety_mod.normalize_text(PAGE),
	}
	assert surety_mod.compare_check(own, own) is True
	for field, wrong in (
		("verdict", "NO_BREACH"),
		("quote_present", True),
		("anchor_drifted", True),
		("evidence_digest", "2" * 64),
		("subject_present", True),
	):
		other = dict(own)
		other[field] = wrong
		assert surety_mod.compare_check(own, other) is False, field
	assert surety_mod.compare_check({}, None) is False


def test_activation_evidence_reports_coverage_bands_and_the_subject_rule(surety_mod):
	text = surety_mod.normalize_text(PAGE)
	exact = surety_mod.activation_evidence(
		text, "Acme Protocol", PROMISE, "literal-absent", "base transfer fee at 0.10 percent"
	)
	assert exact["status"] == "PENDING_MODEL"
	assert exact["coverage_band"] == "COVERAGE_EXACT"
	assert exact["match"] == "VERBATIM"

	reworded = text.replace("commits to keeping", "commits to keep")
	fuzzy = surety_mod.activation_evidence(reworded, "Acme Protocol", PROMISE, "literal-absent", "x")
	assert fuzzy["coverage_band"] == "COVERAGE_GE_0_90"
	assert fuzzy["match"] == "EQUIVALENT"
	assert fuzzy["subject_present"] is True
	assert fuzzy["quote"] in reworded

	absent = surety_mod.activation_evidence(text, "Acme Protocol", "never talks about fees", "literal-absent", "x")
	assert absent["status"] == "REFUSED_PROMISE_ABSENT"

	wrong_subject = surety_mod.activation_evidence(text, "Globex", PROMISE, "literal-absent", "x")
	assert wrong_subject["status"] == "REFUSED_SUBJECT_ABSENT"
	assert wrong_subject["subject_present"] is False


def test_rule_parsing_is_closed_and_exact(surety_mod):
	assert surety_mod.parse_rule("literal-absent:foo") == ("literal-absent", "foo")
	assert surety_mod.parse_rule("literal-present:  foo  ") == ("literal-present", "foo")
	assert surety_mod.parse_rule("semantic: this is a rule of some length")[0] == "semantic"
	assert surety_mod.literal_breached("literal-absent", "foo", "a foo b") is False
	assert surety_mod.literal_breached("literal-absent", "foo", "a bar b") is True
	assert surety_mod.literal_breached("literal-present", "foo", "a foo b") is True
	assert surety_mod.literal_breached("literal-present", "foo", "a bar b") is False
	for bad in ("", "nonsense", "literal-absent:", "semantic: tiny", "LITERAL-ABSENT:x"):
		with pytest.raises(surety_mod.gl.vm.UserError):
			surety_mod.parse_rule(bad)


def test_digest_is_over_the_normalized_quote_and_is_stable(surety_mod):
	assert surety_mod.digest_of("a  b") == surety_mod.digest_of("a b")
	assert surety_mod.digest_of(PROMISE) == surety_mod.digest_of(PROMISE)
	assert surety_mod.digest_of(PROMISE) != surety_mod.digest_of(PROMISE + ".")
