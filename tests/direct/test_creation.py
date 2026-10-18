"""Creation: the terms are validated once, then immutable.

Each refusal sits beside the positive control that shows the same code path accepting a good
value. Grouped by field so a reader can see the whole rule for a field in one place.
"""

from conftest import BENEFICIARY, OWNER, PROMISE, SOURCE, STRANGER, create


def test_positive_control_creation_stores_every_term(direct_vm, contract):
	cid = create(direct_vm, contract)
	record = contract.get_covenant(cid)
	assert record["owner"] == OWNER
	assert record["label"] == "acme-fees"
	assert record["source_url"] == SOURCE
	assert record["subject"] == "Acme Protocol"
	assert record["promise_text"] == PROMISE
	assert record["breach_rule"] == "literal-absent:base transfer fee at 0.10 percent"
	assert record["permitted_changes"] == "documentation formatting"
	assert record["beneficiary"] == BENEFICIARY
	assert record["absence_is_breach"] is True
	assert record["check_cooldown_seconds"] == "60"
	assert record["status"] == "AWAITING_ACTIVATION"
	assert record["bond_declared_atto"] == "1000000000000000000"
	assert record["bond_sent_atto"] == "0"
	assert contract.stats()["covenants"] == 1
	assert contract.list_all(0, 10) == [cid]


def test_label_rules(direct_vm, contract):
	for bad in ("ab", "x" * 65, "bad!label", "-leading"):
		with direct_vm.expect_revert("label must be"):
			create(direct_vm, contract, label=bad)
	# Positive control: the shortest legal and the longest legal both pass.
	assert create(direct_vm, contract, label="abc") != ""
	assert create(direct_vm, contract, label="x" * 64) != ""


def test_url_rules(direct_vm, contract):
	bad_urls = [
		"http://surety.test/terms",
		"https://surety.test/terms#frag",
		"https://user:pw@surety.test/terms",
		"https://127.0.0.1/terms",
		"https://localhost/terms",
		"https://surety/terms",
		"https://surety.test/terms " + "x" * 400,
		"ftp://surety.test/terms",
	]
	for bad in bad_urls:
		with direct_vm.expect_revert():
			create(direct_vm, contract, source_url=bad)
		# Positive control
	assert create(direct_vm, contract, label="url-ok", source_url="https://surety.test/terms?v=2") != ""


def test_promise_rules(direct_vm, contract):
	for bad in ("short", " " * 200, "!@#$%^&*()", "x" * 401):
		with direct_vm.expect_revert():
			create(direct_vm, contract, promise_text=bad)
	assert create(direct_vm, contract, label="promise-ok", promise_text="x" * 400) != ""


def test_subject_rules(direct_vm, contract):
	for bad in ("ab", "x" * 65):
		with direct_vm.expect_revert("subject must be"):
			create(direct_vm, contract, subject=bad)
	assert create(direct_vm, contract, label="subject-ok", subject="Acme Protocol Incorporated") != ""


def test_breach_rule_language_is_closed(direct_vm, contract):
	bad_rules = [
		"the page must not change",
		"literal-absent:",
		"literal-present:",
		"semantic:short",
		"literal-absent:" + "x" * 300,
		"Literal-Absent:foo",
	]
	for bad in bad_rules:
		with direct_vm.expect_revert():
			create(direct_vm, contract, breach_rule=bad)
	# Positive control: all three supported forms are accepted.
	assert create(direct_vm, contract, label="rule-a", breach_rule="literal-absent:base transfer fee") != ""
	assert create(direct_vm, contract, label="rule-b", breach_rule="literal-present:may increase at any time") != ""
	assert create(
		direct_vm, contract, label="rule-c", breach_rule="semantic: the page still states a fixed fee"
	) != ""
	shape = contract.rule_shape("semantic: the page still states a fixed fee")
	assert shape["valid"] is True and shape["needs_model"] is True
	shape = contract.rule_shape("nonsense")
	assert shape["valid"] is False


def test_beneficiary_and_bond_and_cooldown_rules(direct_vm, contract):
	with direct_vm.expect_revert("beneficiary"):
		create(direct_vm, contract, beneficiary="not-an-address")
	with direct_vm.expect_revert("beneficiary"):
		create(direct_vm, contract, beneficiary="0x" + "z" * 40)
	with direct_vm.expect_revert("bond"):
		create(direct_vm, contract, bond_declared_atto="1e18")
	with direct_vm.expect_revert("bond"):
		create(direct_vm, contract, bond_declared_atto="")
	with direct_vm.expect_revert("cooldown"):
		create(direct_vm, contract, check_cooldown_seconds="59")
	with direct_vm.expect_revert("cooldown"):
		create(direct_vm, contract, check_cooldown_seconds="2592001")
	with direct_vm.expect_revert("decimal"):
		create(direct_vm, contract, check_cooldown_seconds="soon")
	# Positive controls at the boundary.
	assert create(direct_vm, contract, label="cd-min", check_cooldown_seconds="60") != ""
	assert create(direct_vm, contract, label="cd-max", check_cooldown_seconds="2592000") != ""
	assert create(direct_vm, contract, label="cd-zero", check_cooldown_seconds="3600") != ""


def test_permitted_changes_cap(direct_vm, contract):
	with direct_vm.expect_revert("permitted changes"):
		create(direct_vm, contract, permitted_changes="x" * 1001)
	assert create(direct_vm, contract, label="pc-ok", permitted_changes="x" * 1000) != ""
	assert create(direct_vm, contract, label="pc-empty", permitted_changes="") != ""


def test_a_covenant_is_not_editable(direct_vm, contract):
	"""There is no setter at all: the public surface has creation, activation and checks only."""
	writes = [name for name in dir(contract) if not name.startswith("_")]
	for forbidden in ("update_covenant", "set_stake", "set_rules", "edit", "revoke"):
		assert forbidden not in writes


def test_duplicate_label_for_the_same_owner_is_refused(direct_vm, contract):
	create(direct_vm, contract)
	with direct_vm.expect_revert("already has a covenant with that label"):
		create(direct_vm, contract)
	# Positive control: the same label from a different owner is fine, and vice versa.
	assert create(direct_vm, contract, label="second", sender=OWNER) != ""
	assert create(direct_vm, contract, sender=STRANGER) != ""


def test_ids_are_derived_from_the_sender_not_from_a_caller_supplied_id(direct_vm, contract):
	first = create(direct_vm, contract, sender=OWNER)
	second = create(direct_vm, contract, sender=STRANGER)
	assert first != second
	assert contract.get_covenant(first)["owner"] == OWNER
	assert contract.get_covenant(second)["owner"] == STRANGER


def test_self_beneficiary_is_allowed_but_flagged(direct_vm, contract):
	self_beneficiary = create(direct_vm, contract, label="self", beneficiary=OWNER)
	assert contract.get_covenant(self_beneficiary)["beneficiary_is_owner"] is True
	third_party = create(direct_vm, contract, label="third", beneficiary=BENEFICIARY)
	assert contract.get_covenant(third_party)["beneficiary_is_owner"] is False


def test_list_covenants_filters_by_owner_and_needs_a_real_address(direct_vm, contract):
	create(direct_vm, contract, sender=OWNER)
	create(direct_vm, contract, sender=STRANGER)
	assert len(contract.list_covenants(OWNER)) == 1
	assert len(contract.list_covenants(STRANGER)) == 1
	with direct_vm.expect_revert("owner must be"):
		contract.list_covenants("nope")
	assert contract.list_covenants("0x" + "0" * 40) == []
	assert len(contract.list_all(0, 50)) == 2
	assert len(contract.list_all(1, 50)) == 1
	assert contract.list_all(99, 50) == []


def test_unknown_covenant_reads_are_refused_not_defaulted(direct_vm, contract):
	with direct_vm.expect_revert("unknown covenant"):
		contract.get_covenant("0" * 64)
	with direct_vm.expect_revert("unknown covenant"):
		contract.bond_status("0" * 64)
	assert contract.is_active("0" * 64) is False
