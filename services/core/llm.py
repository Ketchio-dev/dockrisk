"""Ordered LLM endpoints, tried in turn.

The product has two language moments (`policy_extract`, `notice`) and both already
degrade to a deterministic path — the rules parser and the letter template — when no
model answers. That last resort stays. What sits in front of it is now a *chain*
rather than one endpoint, so a sponsor's credits can be first in line without
becoming a single point of failure on stage.

Order comes from `DOCKRISK_LLM_CHAIN` (default `spur,proxy`). Each named rung reads
its own base URL, key and model, and a rung with no key is skipped silently rather
than spending a demo on an auth error:

    SPUR_BASE_URL   SPUR_API_KEY   SPUR_MODEL        # sponsored credits; model id is spur-glm-5-2
    OPENAI_BASE_URL OPENAI_API_KEY DOCKRISK_EXTRACT_MODEL

Anthropic keeps its own path in the callers; this module is the OpenAI-compatible
side, which is what both endpoints speak.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Rung:
    """One OpenAI-compatible endpoint, ready to be tried."""
    name: str
    base_url: str
    api_key: str
    model: str

    def client(self):
        from openai import OpenAI  # imported lazily: the rules path must not need it
        return OpenAI(base_url=self.base_url, api_key=self.api_key)


def _rung(name: str) -> Rung | None:
    if name == "spur":
        key = os.environ.get("SPUR_API_KEY", "").strip()
        if not key:
            return None
        return Rung(
            name="spur",
            base_url=os.environ.get("SPUR_BASE_URL", "https://ai.spuric.com/v1").strip(),
            api_key=key,
            model=os.environ.get("SPUR_MODEL", "spur-glm-5-2").strip(),
        )
    if name == "proxy":
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        base = os.environ.get("OPENAI_BASE_URL", "").strip()
        if not key or not base:
            return None
        return Rung(
            name="proxy",
            base_url=base,
            api_key=key,
            model=os.environ.get("DOCKRISK_EXTRACT_MODEL", "gpt-6-astra").strip(),
        )
    return None


def chain() -> list[Rung]:
    """The endpoints to try, in order, skipping any that are not configured."""
    order = [n.strip().lower() for n in os.environ.get("DOCKRISK_LLM_CHAIN", "spur,proxy").split(",") if n.strip()]
    out: list[Rung] = []
    for name in order:
        r = _rung(name)
        if r and not any(x.name == r.name for x in out):
            out.append(r)
    return out


def call(fn):
    """Run `fn(rung)` down the chain; return the first success.

    Raises the LAST error when every rung fails, so the caller's existing
    `except` still lands on the deterministic path. The returned value is
    `(result, rung, notes)` — `notes` naming the rungs that failed, so the UI
    can say the sponsor's endpoint was down instead of quietly using the backup.
    """
    rungs = chain()
    if not rungs:
        raise RuntimeError("no LLM endpoint configured (set SPUR_API_KEY or OPENAI_API_KEY)")
    notes: list[str] = []
    last: Exception | None = None
    for r in rungs:
        try:
            return fn(r), r, notes
        except Exception as e:  # auth, rate limit, network, refusal — try the next rung
            last = e
            notes.append(f"{r.name}: {type(e).__name__}: {str(e)[:60]}")
    raise RuntimeError("; ".join(notes)) from last
