"""What the live Studionet run found that the suite had not.

Both defects below were found by pointing the deployed contract at a real page on the internet
and reading the verdict it produced, not by reading the code again. Each one is pinned here with
the positive control that makes the test mean something.

L1 -- literal rule matching was case-sensitive. The owner writes a rule in their own lower case;
     a page capitalises its sentences. A breach that had happened was reported as no breach.
L2 -- nothing recorded which bytes a check actually read, so a reader could not tell whether the
     contract was looking at the same page they were, and a check served a stale copy from a
     cache was invisible.
"""

from conftest import (
	PAGE,
	PAGE_BREACHED,
	PAGE_PROMISE_PLUS_BREACH,
	PROMISE,
	active_covenant,
	advance,
	create,
	page_fields,
	serve,
)

# The promise sentence untouched, one unrelated sentence reworded. A cosmetic change of the kind
# the owner's `permitted_changes` allows, so it must not become a breach by itself.
PAGE_MODIFIED = PAGE.replace("Fees are reviewed annually.", "Fees are reviewed once a year.")

# The forbidden sentence as it appears naturally on a page: capitalised.
FORBIDDEN_UPPER = "Acme Protocol may increase the base transfer fee at any time"
FORBIDDEN_LOWER = FORBIDDEN_UPPER.lower()


# ------------------------------------------------------------------ L1: case-insensitive literals


def test_literal_present_fires_on_a_page_that_capitalises_the_rule(direct_vm, contract):
	"""The live failure: rule lower case, page capitalised, breach missed."""
	cid = active_covenant(
		direct_vm,
		contract,
		label="case-present",
		breach_rule="literal-present:" + FORBIDDEN_LOWER,
		absence_is_breach=False,
	)
	assert FORBIDDEN_UPPER in PAGE_PROMISE_PLUS_BREACH  # the page really does carry it

	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.request_check(cid) == "BREACH"
	assert contract.get_covenant(cid)["status"] == "BREACHED"

	# Positive control: the same rule, the same capitalisation style, and the forbidden sentence
	# genuinely absent -- no breach, and the covenant stays active.
	control = active_covenant(
		direct_vm,
		contract,
		label="case-present-control",
		breach_rule="literal-present:" + FORBIDDEN_LOWER,
		absence_is_breach=False,
	)
	serve(direct_vm, PAGE)
	assert contract.request_check(control) == "NO_BREACH"
	assert contract.get_covenant(control)["status"] == "ACTIVE"


def test_literal_absent_does_not_fire_on_capitalisation_alone(direct_vm, contract):
	"""The mirror image: a required sentence present in capitals is present, so no breach."""
	cid = create(
		direct_vm,
		contract,
		label="case-absent",
		breach_rule="literal-absent:" + FORBIDDEN_LOWER,
		absence_is_breach=True,
	)
	# Activate while the required sentence is there. Capitalised counts as there: this is the
	# call that would have refused with ALREADY_IN_BREACH before the case folding.
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.activate(cid) == "ACTIVE"

	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.request_check(cid) == "NO_BREACH"
	assert contract.get_covenant(cid)["status"] == "ACTIVE"

	# Positive control: the required sentence really is gone, so the rule fires.
	control = create(
		direct_vm,
		contract,
		label="case-absent-control",
		breach_rule="literal-absent:" + FORBIDDEN_LOWER,
		absence_is_breach=True,
	)
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.activate(control) == "ACTIVE"
	serve(direct_vm, PAGE)
	assert contract.request_check(control) == "BREACH"


def test_activation_refuses_a_forbidden_sentence_whatever_its_case(direct_vm, contract):
	"""The live case exactly: an owner's lower-case rule against a page's capitalised sentence."""
	cid = create(
		direct_vm,
		contract,
		label="already-broken",
		breach_rule="literal-present:" + FORBIDDEN_LOWER,
	)
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert contract.activate(cid) == "REFUSED_ALREADY_IN_BREACH"

	# Positive control: activation succeeds on the same page when the rule cannot already fire.
	control = create(
		direct_vm,
		contract,
		label="already-broken-control",
		breach_rule="literal-present:" + FORBIDDEN_LOWER,
	)
	serve(direct_vm, PAGE)
	assert contract.activate(control) == "ACTIVE"


def test_literal_matching_folds_case_and_is_pinned_as_a_table(surety_mod):
	fold = surety_mod.literal_breached
	assert fold("literal-present", FORBIDDEN_LOWER, PAGE_PROMISE_PLUS_BREACH) is True
	assert fold("literal-present", FORBIDDEN_UPPER, PAGE_PROMISE_PLUS_BREACH) is True
	assert fold("literal-absent", FORBIDDEN_LOWER, PAGE_PROMISE_PLUS_BREACH) is False
	assert fold("literal-absent", FORBIDDEN_UPPER, PAGE_PROMISE_PLUS_BREACH) is False
	# And the control the other way: absent means absent, in every case.
	assert fold("literal-present", "no such sentence", PAGE) is False
	assert fold("literal-absent", "no such sentence", PAGE) is True


# ------------------------------------------------------------------ L2: the page digest


def test_activation_records_the_digest_of_the_whole_page_it_read(surety_mod, direct_vm, contract):
	cid = create(direct_vm, contract, label="digest-on-activation")
	serve(direct_vm, PAGE)
	assert contract.activate(cid) == "ACTIVE"

	record = contract.get_covenant(cid)
	text = surety_mod.normalize_text(PAGE)
	assert record["anchor_text_digest"] == surety_mod.page_digest(text)
	assert record["anchor_text_digest"] != ""
	# It is the page digest, not the quote digest: the two are different values.
	assert record["anchor_text_digest"] != record["anchor_digest"]
	assert record["anchor_digest"] == surety_mod.digest_of(record["anchor_quote"])


def test_check_records_the_page_it_read_and_the_digest_moves_with_the_page(surety_mod, direct_vm, contract):
	cid = active_covenant(direct_vm, contract, label="digest-on-check", absence_is_breach=False)

	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"
	first = contract.get_covenant(cid)["last_check_text_digest"]
	assert first == surety_mod.page_digest(surety_mod.normalize_text(PAGE))

	# A cosmetic reword. Not a breach -- but the digest must show that different bytes were read,
	# because that is the only way a reader can tell a fresh check from a stale one.
	advance(direct_vm, 60)
	serve(direct_vm, PAGE_MODIFIED)
	assert contract.request_check(cid) == "NO_BREACH"
	second = contract.get_covenant(cid)["last_check_text_digest"]
	assert second == surety_mod.page_digest(surety_mod.normalize_text(PAGE_MODIFIED))
	assert second != first


def test_a_leader_that_reports_a_different_page_digest_is_rejected(direct_vm, contract):
	cid = active_covenant(
		direct_vm,
		contract,
		label="digest-forgery",
		breach_rule="literal-absent:base transfer fee at 0.10 percent",
		absence_is_breach=False,
	)

	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"

	import sys

	mod = sys.modules["_contract_surety"]
	honest = {
		"verdict": "NO_BREACH",
		"rule_kind": "literal-absent",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "",
	}
	text = mod.normalize_text(PAGE)
	honest["text"] = text
	honest["text_digest"] = mod.page_digest(text)

	# Positive control: an honest leader is agreed with.
	serve(direct_vm, PAGE)
	assert direct_vm.run_validator(leader_result=honest) is True

	# A leader claiming different bytes than the validator fetched is rejected outright.
	lying = dict(honest)
	lying["text_digest"] = mod.page_digest(mod.normalize_text(PAGE_BREACHED))
	assert direct_vm.run_validator(leader_result=lying) is False


def test_page_digest_is_empty_for_nothing_and_stable_for_something(surety_mod):
	assert surety_mod.page_digest("") == ""
	assert surety_mod.page_digest(PAGE) == surety_mod.page_digest(PAGE)
	assert surety_mod.page_digest(PAGE) != surety_mod.page_digest(PAGE_MODIFIED)
	assert len(surety_mod.page_digest(PAGE)) == 64


# ------------------------------------------------------------------ L3: a literal breach must be
# ------------------------------------------------------------------ agreement-reachable
#
# Found live, twice, as MAJORITY_DISAGREE on a page that really had gained the forbidden clause.
# compare_check demanded a non-empty rule_span for every BREACH, but a literal breach has no span
# to cite -- the string comparison is the evidence. The leader therefore reported a truthful
# empty span and every validator rejected it, so a literal rule could never reach BREACH on chain.
# The hermetic suite missed it because direct mode runs the leader only, so a literal breach was
# only ever asserted at the point where the leader writes, never at the point where a validator
# agrees.


def test_a_literal_breach_is_agreeable_with_an_empty_span(surety_mod):
	own = {
		"verdict": "BREACH",
		"rule_kind": "literal-present",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "",
	}
	own.update(page_fields(surety_mod))
	assert surety_mod.compare_check(own, own) is True

	# A literal breach that tries to bring a citation anyway is rejected: there is nothing that
	# could have produced it, so it would be a claim, not evidence.
	with_span = dict(own)
	with_span["rule_span"] = "Fees are reviewed annually"
	assert surety_mod.compare_check(with_span, own) is False


def test_a_semantic_breach_is_agreeable_only_with_a_findable_span(surety_mod):
	own = {
		"verdict": "BREACH",
		"rule_kind": "semantic",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "Fees are reviewed annually",
	}
	own.update(page_fields(surety_mod))
	assert surety_mod.compare_check(own, own) is True

	no_span = dict(own)
	no_span["rule_span"] = ""
	assert surety_mod.compare_check(no_span, own) is False

	not_findable = dict(own)
	not_findable["rule_span"] = "a sentence that is not on this page"
	assert surety_mod.compare_check(not_findable, own) is False


def test_the_rule_kind_is_compared_not_assumed(surety_mod):
	"""A leader claiming a different rule shape than the covenant holds is rejected."""
	own = {
		"verdict": "BREACH",
		"rule_kind": "literal-present",
		"quote_present": True,
		"anchor_drifted": False,
		"evidence_digest": surety_mod.digest_of(PROMISE),
		"subject_present": True,
		"rule_span": "",
	}
	own.update(page_fields(surety_mod))
	lying = dict(own)
	lying["rule_kind"] = "semantic"
	assert surety_mod.compare_check(lying, own) is False


def test_validator_agrees_with_a_real_literal_breach(direct_vm, contract):
	"""The live failure, reproduced at the point where it actually happened.

	The leader's result here is rebuilt by the contract's own pure function on the same text the
	mocks serve, which is what the leader return value is, and then handed to the real validator
	closure through run_validator.
	"""
	import sys

	mod = sys.modules["_contract_surety"]
	cid = active_covenant(
		direct_vm,
		contract,
		label="validator-literal-breach",
		breach_rule="literal-present:" + FORBIDDEN_LOWER,
		absence_is_breach=False,
	)

	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	text = mod.normalize_text(PAGE_PROMISE_PLUS_BREACH)
	leader = mod.check_evidence(
		text,
		"Acme Protocol",
		PROMISE,
		"literal-present",
		FORBIDDEN_LOWER,
	)
	leader["anchor_drifted"] = leader["evidence_digest"] != contract.get_covenant(cid)["anchor_digest"]
	leader["text"] = text
	assert leader["verdict"] == "BREACH"
	assert leader["rule_span"] == ""

	# Run the check first, so the captured closure is the check's validator and not activation's.
	assert contract.request_check(cid) == "BREACH"

	# Same world for the validator: it must agree. This is the assertion that failed live.
	serve(direct_vm, PAGE_PROMISE_PLUS_BREACH)
	assert direct_vm.run_validator(leader_result=leader) is True

	# And the on-chain record keeps the breach and the empty span together.
	record = contract.get_covenant(cid)
	assert record["status"] == "BREACHED"
	assert record["last_check_verdict"] == "BREACH"
	assert record["last_check_quote_present"] is True
	assert record["last_check_rule_span"] == ""
	assert record["last_check_evidence_digest"] == record["anchor_digest"]
