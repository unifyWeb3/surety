"""Sanity checks on the harness itself, so a later pass cannot pass for the wrong reason."""

from conftest import PAGE, PROMISE


def test_harness_deploys_and_contract_has_a_clean_slate(contract):
	stats = contract.stats()
	assert stats["covenants"] == 0
	assert stats["breaches"] == 0
	assert stats["checks"] == 0
	assert stats["activation_refusals"] == 0


def test_pure_helpers_are_reachable_from_tests(surety_mod):
	"""Validator logic must be testable without a validator: direct mode runs the leader only."""
	assert hasattr(surety_mod, "compare_activation")
	assert hasattr(surety_mod, "compare_check")
	assert hasattr(surety_mod, "anchored_quote")


def test_anchored_quote_finds_the_verbatim_promise(surety_mod):
	text = surety_mod.normalize_text(PAGE)
	quote, coverage = surety_mod.anchored_quote(text, PROMISE, "Acme Protocol")
	assert coverage == 1.0
	assert quote == PROMISE
	assert surety_mod.coverage_band(coverage) == surety_mod.COVERAGE_BAND_EXACT
	assert surety_mod.digest_of(quote) == surety_mod.digest_of(quote)


def test_normalization_is_idempotent_and_collapses_whitespace(surety_mod):
	once = surety_mod.normalize_text("a\n\nb\u00a0\u00a0c")
	assert once == "a b c"
	assert surety_mod.normalize_text(once) == once
