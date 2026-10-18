"""Stage 3 self-review. Each test here exists because reading the diff produced a doubt.

Kept in its own file so the reviewer's findings are visible as a set rather than buried in the
happy-path files.
"""

from conftest import (
	BENEFICIARY,
	OWNER,
	PAGE,
	PAGE_BREACHED,
	PAGE_PROMISE_REMOVED,
	SPENDER,
	STRANGER,
	active_covenant,
	advance,
	create,
	serve,
	surety_mod,
)


def test_absence_as_breach_records_no_evidence_and_says_so(direct_vm, contract):
	"""A breach by absence has no quote, so it must have no digest either. Pin the pair."""
	cid = active_covenant(direct_vm, contract, absence_is_breach=True)
	serve(direct_vm, PAGE_PROMISE_REMOVED)
	assert contract.request_check(cid) == "BREACH"
	record = contract.get_covenant(cid)
	assert record["last_check_verdict"] == "BREACH"
	assert record["last_check_quote_present"] is False
	assert record["last_check_evidence_digest"] == ""
	assert record["last_check_rule_span"] == ""
	assert record["breached_at"] != ""


def test_a_two_hundred_with_an_empty_body_is_a_refusal_not_an_agreement(direct_vm, contract):
	"""The SDK cannot distinguish empty from failed, so the contract must treat both as unproven."""
	cid = create(direct_vm, contract, label="empty-body")
	serve(direct_vm, "", status=200)
	assert contract.activate(cid) == "REFUSED_SOURCE_UNREACHABLE"
	assert contract.is_active(cid) is False

	control = create(direct_vm, contract, label="empty-body-control")
	serve(direct_vm, PAGE, status=200)
	assert contract.activate(control) == "ACTIVE"

	live = active_covenant(direct_vm, contract, label="empty-on-check")
	serve(direct_vm, "", status=200)
	assert contract.request_check(live) == "UNREACHABLE"
	assert contract.get_covenant(live)["status"] == "ACTIVE"


def test_no_write_method_accepts_an_address_so_no_one_can_label_a_stranger(direct_vm, contract):
	"""Rejection mode 2: a caller may only write state about themselves.

	``beneficiary`` is the one address parameter anywhere, and it is stored inside the caller's
	own covenant as the caller's own declaration -- it is not a registry keyed by that address,
	and the UI labels it as declared by the owner rather than confirmed by the beneficiary.
	"""
	import inspect
	import sys

	mod = sys.modules["_contract_surety"]
	writes = {
		name: str(inspect.signature(getattr(mod.Surety, name)))
		for name in ("create_covenant", "activate", "request_check")
	}
	assert "beneficiary" in writes["create_covenant"]
	assert "beneficiary" not in writes["activate"]
	assert "beneficiary" not in writes["request_check"]
	assert str(inspect.signature(mod.Surety.create_covenant)).count("str") >= 4

	# A stranger cannot name another address as owner of anything.
	cid = create(direct_vm, contract, sender=STRANGER, beneficiary=BENEFICIARY)
	assert contract.get_covenant(cid)["owner"] == STRANGER
	assert contract.get_covenant(cid)["beneficiary"] == BENEFICIARY
	assert contract.get_covenant(cid)["beneficiary_is_owner"] is False
	assert len(contract.list_covenants(BENEFICIARY)) == 0


def test_list_covenants_scan_is_capped_and_older_records_stay_reachable(direct_vm, contract):
	"""An unbounded scan is a read that stops working later. The cap is real and documented."""
	caps = contract.stats()
	scan_cap = int(caps["list_scan_cap"])
	assert scan_cap == 400
	assert int(caps["list_results_cap"]) == 50

	first = create(direct_vm, contract, label="oldest", sender=OWNER)
	for index in range(scan_cap):
		create(direct_vm, contract, label="filler-%d" % index, sender=SPENDER)

	listed = contract.list_covenants(OWNER)
	assert len(listed) == 0
	# Still readable by id, which is the documented fallback.
	assert contract.get_covenant(first)["label"] == "oldest"

	# Positive control: a covenant inside the window is found.
	fresh = create(direct_vm, contract, label="fresh", sender=OWNER)
	found = contract.list_covenants(OWNER)
	assert [row["covenant_id"] for row in found] == [fresh]


def test_rule_shape_is_the_only_place_a_rule_is_explained_and_it_agrees_with_parsing(surety_mod):
	for rule, valid, needs_model in (
		("literal-absent:base transfer fee", True, False),
		("literal-present:may increase", True, False),
		("semantic: the page no longer states a fixed fee", True, True),
		("   ", False, False),
		("because I am the owner", False, False),
	):
		kind, arg = ("", "")
		try:
			kind, arg = surety_mod.parse_rule(rule)
		except surety_mod.gl.vm.UserError:
			kind = ""
		assert (kind != "") is valid, rule
		assert (kind == surety_mod.RULE_SEMANTIC) is needs_model, rule


def test_dead_constants_are_gone_so_the_state_machine_has_no_unreachable_states(surety_mod):
	"""A status constant nothing can produce is a lie in the docs waiting to happen."""
	produced = set()
	for name in dir(surety_mod):
		if name.startswith("STATUS_") or name.startswith("VERDICT_"):
			produced.add(getattr(surety_mod, name))
	for missing in ("REFUSED_SOURCE_UNSTABLE", "SOURCE_UNSTABLE"):
		assert missing not in produced, missing
	assert "UNREACHABLE" in produced
	assert "REFUSED_SOURCE_UNREACHABLE" in produced


def test_the_anchor_digest_is_over_normalized_text_and_that_is_what_the_docs_say(surety_mod):
	"""The stored quote is verbatim *after normalization*, not verbatim bytes.

	Pinning this because 'verbatim' is the kind of word a README overstates.
	"""
	raw = "fee at\n\n0.10\tpercent"
	assert surety_mod.normalize_text(raw) == "fee at 0.10 percent"
	assert surety_mod.digest_of("fee at 0.10 percent") == surety_mod.digest_of(raw)


def test_labels_are_case_sensitive_and_normalization_does_not_merge_them(direct_vm, contract):
	"""Two labels that differ only in case are two covenants. Documented, not accidental."""
	create(direct_vm, contract, label="AbC")
	with direct_vm.expect_revert("already has a covenant"):
		create(direct_vm, contract, label="AbC")
	other = create(direct_vm, contract, label="abc")
	assert other != ""


def test_a_breached_covenant_cannot_be_re_activated_or_checked_into_another_state(direct_vm, contract):
	cid = active_covenant(direct_vm, contract, absence_is_breach=True)
	serve(direct_vm, PAGE_BREACHED)
	assert contract.request_check(cid) == "BREACH"
	record = contract.get_covenant(cid)
	assert record["status"] == "BREACHED"
	assert record["is_active"] is False
	with direct_vm.expect_revert("not awaiting activation"):
		contract.activate(cid)
	advance(direct_vm, 120)
	serve(direct_vm, PAGE)
	with direct_vm.expect_revert("not active"):
		contract.request_check(cid)
	assert contract.get_covenant(cid)["last_check_seq"] == "1"
