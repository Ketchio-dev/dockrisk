"""The chain is a stage prop: it has to fail over silently and in a fixed order.

SPUR's sponsored credits answered 402 mid-build and the demo kept going, which is the whole
reason this module exists — and then the reason SPUR came out of the default order. These tests
pin the three properties that matter on stage: the order is the order written down, a rung with
no key is skipped rather than spending a demo on an auth error, and the sponsor rung is still one
environment variable away if the credits ever turn on.
"""
import pytest

from core import llm


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for k in ("DOCKRISK_LLM_CHAIN", "SPUR_API_KEY", "SPUR_BASE_URL", "SPUR_MODEL",
              "OPENAI_API_KEY", "OPENAI_BASE_URL", "DOCKRISK_EXTRACT_MODEL",
              "OPENROUTER_API_KEY", "OPENROUTER_BASE_URL", "OPENROUTER_MODEL"):
        monkeypatch.delenv(k, raising=False)


def _all_three(monkeypatch):
    monkeypatch.setenv("SPUR_API_KEY", "k1")
    monkeypatch.setenv("OPENAI_API_KEY", "k2")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://proxy.example/v1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "k3")


def test_default_order_is_proxy_then_openrouter_and_skips_the_sponsor(monkeypatch):
    # SPUR_API_KEY is set here and the rung still must not run: 402 on every call is worth
    # nothing but a failed round trip in front of the two endpoints that answer.
    _all_three(monkeypatch)
    assert [r.name for r in llm.chain()] == ["proxy", "openrouter"]


def test_the_sponsor_rung_is_one_environment_variable_away(monkeypatch):
    _all_three(monkeypatch)
    monkeypatch.setenv("DOCKRISK_LLM_CHAIN", "spur,proxy,openrouter")
    assert [r.name for r in llm.chain()] == ["spur", "proxy", "openrouter"]


def test_openrouter_defaults_to_luna_on_openrouters_own_host(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "k3")
    monkeypatch.setenv("DOCKRISK_LLM_CHAIN", "openrouter")
    (r,) = llm.chain()
    assert r.base_url == "https://openrouter.ai/api/v1"
    assert r.model == "openai/gpt-5.6-luna"


def test_a_rung_without_a_key_is_skipped_not_tried(monkeypatch):
    # This is the case that actually happens: the proxy goes away and nothing else changes.
    monkeypatch.setenv("OPENROUTER_API_KEY", "k3")
    assert [r.name for r in llm.chain()] == ["openrouter"]


def test_the_proxy_needs_both_a_key_and_a_base_url(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k2")          # no OPENAI_BASE_URL
    monkeypatch.setenv("OPENROUTER_API_KEY", "k3")
    assert [r.name for r in llm.chain()] == ["openrouter"]


def test_call_walks_down_and_names_what_failed(monkeypatch):
    _all_three(monkeypatch)
    monkeypatch.setenv("DOCKRISK_LLM_CHAIN", "spur,proxy,openrouter")
    tried = []

    def fn(rung):
        tried.append(rung.name)
        if rung.name != "openrouter":
            raise RuntimeError("Error code: 402 - insufficient credit")
        return "drafted"

    got, rung, notes = llm.call(fn)
    assert (got, rung.name) == ("drafted", "openrouter")
    assert tried == ["spur", "proxy", "openrouter"]
    # The UI says which endpoint was down rather than quietly using the backup.
    assert [n.split(":")[0] for n in notes] == ["spur", "proxy"]


def test_every_rung_down_raises_so_the_caller_lands_on_the_rules(monkeypatch):
    _all_three(monkeypatch)

    def fn(rung):
        raise RuntimeError("down")

    with pytest.raises(RuntimeError) as e:
        llm.call(fn)
    assert "proxy" in str(e.value) and "openrouter" in str(e.value)


def test_no_endpoint_configured_raises_rather_than_returning_nothing(monkeypatch):
    with pytest.raises(RuntimeError, match="no LLM endpoint"):
        llm.call(lambda r: "never")
