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

from conftest import PAGE, PAGE_BREACHED, PAGE_PROMISE_PLUS_BREACH, PROMISE, active_covenant, advance, create, serve

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
	cid = active_covenant(direct_vm, contract, label="digest-forgery", absence_is_breach=False)

	serve(direct_vm, PAGE)
	assert contract.request_check(cid) == "NO_BREACH"

	import sys

	mod = sys.modules["_contract_surety"]
	honest = {
		"verdict": "NO_BREACH",
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
