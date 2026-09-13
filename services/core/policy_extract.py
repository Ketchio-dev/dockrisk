"""Detention terms from a rate confirmation.

AI where language is messy, rules where money is precise: the model only turns free text into a
structured draft with quoted evidence. A dispatcher confirms it before it becomes a policy, and the
deterministic engine in core/visits.py does every calculation.

Three paths, all labeled in `source` / `provider` / `model`:
  extracted-llm    an LLM via structured outputs — provider chosen by DOCKRISK_EXTRACT_PROVIDER:
                     openai     OpenAI-compatible chat.completions.parse (OPENAI_BASE_URL / OPENAI_API_KEY), e.g. gpt-5.6-luna
                     anthropic  Claude messages.parse (ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY), e.g. claude-opus-5
                     auto       openai if OPENAI_API_KEY is set, else anthropic
  extracted-rules  regex parser — always available, used as fallback and as the offline test path
"""
from __future__ import annotations

import os
import re
from typing import Literal

from pydantic import BaseModel, Field

BillingStart = Literal["max_checkin_appointment", "arrival", "appointment", "dock_in"]


class DetentionTerms(BaseModel):
    free_time_min: int | None = Field(None, description="Free time before detention accrues, in minutes")
    rate_per_hour: float | None = Field(None, description="Detention rate in dollars per hour")
    increment_min: int | None = Field(None, description="Billing increment in minutes, if stated")
    minimum_charge: float | None = Field(None, description="Minimum detention charge in dollars, if stated")
    maximum_charge: float | None = Field(None, description="Maximum detention charge per stop in dollars, if stated")
    billing_start_rule: BillingStart | None = Field(None, description="When the clock starts. 'max_checkin_appointment' when detention counts from the later of check-in and appointment; 'arrival' if from arrival regardless of appointment; 'appointment' if from the appointment time; 'dock_in' if from being assigned a door")
    requires_on_time_arrival: bool | None = Field(None, description="True if detention is only payable when the driver arrived on time for the appointment")
    required_evidence: list[str] = Field(default_factory=list, description="Evidence the customer requires, e.g. 'signed in/out times', 'BOL', 'POD', 'driver check-in'")
    applies_to: list[str] = Field(default_factory=list, description="Stops the terms apply to: 'shipper', 'consignee', or both")
    evidence_quotes: list[str] = Field(default_factory=list, description="Verbatim quotes from the text that support each extracted value")
    notes: str | None = Field(None, description="Anything ambiguous or missing that a dispatcher should check")


class Extraction(BaseModel):
    terms: DetentionTerms
    source: Literal["extracted-llm", "extracted-rules"]
    provider: str | None = None
    model: str | None = None
    warning: str | None = None


SYSTEM = (
    "You extract detention (dock waiting) terms from freight rate confirmations and carrier-shipper agreements. "
    "Only report values that the text states or clearly implies; leave a field null when the text is silent. "
    "Quote the exact supporting text for every value in evidence_quotes. Do not compute charges."
)


def _rules(text: str) -> DetentionTerms:
    t = text.replace("\n", " ")
    low = t.lower()
    quotes: list[str] = []

    def grab(pattern, flags=re.I):
        m = re.search(pattern, t, flags)
        if m:
            quotes.append(m.group(0).strip())
        return m

    free = None
    m = grab(r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of\s+)?free") or grab(r"free\s*time[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)") \
        or grab(r"first\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)")
    if m:
        free = int(round(float(m.group(1)) * 60))
    m = grab(r"(\d+)\s*(?:minutes?|mins?)\s*(?:of\s+)?free") if free is None else None
    if m:
        free = int(m.group(1))
    rate = None
    m = grab(r"\$\s?(\d+(?:\.\d+)?)\s*(?:/|per)\s*(?:hour|hr)")
    if m:
        rate = float(m.group(1))
    inc = None
    m = grab(r"(\d+)\s*[- ]?(?:minute|min)\s*increments?") or grab(r"increments?\s*of\s*(\d+)\s*(?:minutes?|mins?)")
    if m:
        inc = int(m.group(1))
    mx = None
    m = grab(r"(?:max(?:imum)?|cap(?:ped)?|not\s+to\s+exceed)[^$\d]{0,25}\$\s?(\d+(?:\.\d+)?)")
    if m:
        mx = float(m.group(1))
    mn = None
    m = grab(r"\bmin(?:imum)?\b(?!ute)[^$\d]{0,25}\$\s?(\d+(?:\.\d+)?)")
    if m:
        mn = float(m.group(1))
    on_time = None
    if grab(r"(?:must|shall)\s+(?:be|arrive)\s+on[- ]time") or grab(r"not\s+(?:payable|paid|applicable)\s+if\s+(?:the\s+)?(?:driver|carrier)\s+(?:is\s+)?late"):
        on_time = True
    rule: BillingStart | None = None
    if grab(r"later\s+of\s+[^.]{0,40}?(?:arrival|check[- ]?in)[^.]{0,40}?appointment"):
        rule = "max_checkin_appointment"
    elif grab(r"from\s+(?:the\s+)?(?:scheduled\s+)?appointment\s+time"):
        rule = "appointment"
    elif grab(r"from\s+(?:the\s+)?(?:time\s+of\s+)?arrival"):
        rule = "arrival"
    elif grab(r"(?:door|dock)\s+assign"):
        rule = "dock_in"
    ev = []
    for label, pat in (("signed in/out times", r"in\s*/?\s*out\s+times?"), ("BOL", r"\bBOL\b|bill\s+of\s+lading"), ("POD", r"\bPOD\b|proof\s+of\s+delivery"),
                       ("driver check-in", r"check[- ]?in"), ("facility signature", r"sign(?:ed|ature)")):
        if re.search(pat, t, re.I):
            ev.append(label)
    applies = [s for s, pat in (("shipper", r"shipper|pick[- ]?up"), ("consignee", r"consignee|receiver|deliver")) if re.search(pat, t, re.I)]
    missing = [k for k, v in (("free time", free), ("rate", rate)) if v is None]
    return DetentionTerms(free_time_min=free, rate_per_hour=rate, increment_min=inc, minimum_charge=mn, maximum_charge=mx,
                          billing_start_rule=rule, requires_on_time_arrival=on_time, required_evidence=ev, applies_to=applies,
                          evidence_quotes=quotes, notes=("rules parser; not stated: " + ", ".join(missing)) if missing else "rules parser")


def _anthropic(text: str, model: str) -> Extraction:
    import anthropic  # resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile, ANTHROPIC_BASE_URL
    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=model,
        max_tokens=4096,
        system=SYSTEM,
        messages=[{"role": "user", "content": f"Rate confirmation / agreement text:\n\n{text}"}],
        output_format=DetentionTerms,
    )
    return Extraction(terms=response.parsed_output, source="extracted-llm", provider="anthropic", model=model)


def _openai(text: str, model: str | None = None) -> Extraction:
    """Try each OpenAI-compatible endpoint in `core.llm.chain()` — the proxy, then
    OpenRouter. `model` overrides the rung's own model when given."""
    from . import llm

    def once(rung: "llm.Rung") -> Extraction:
        completion = rung.client().chat.completions.parse(
            model=model or rung.model,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": f"Rate confirmation / agreement text:\n\n{text}"}],
            response_format=DetentionTerms,
        )
        msg = completion.choices[0].message
        if msg.refusal:
            raise RuntimeError(f"model refused: {msg.refusal}")
        return Extraction(terms=msg.parsed, source="extracted-llm", provider=rung.name, model=model or rung.model)

    got, rung, notes = llm.call(once)
    if notes:  # a higher-priority endpoint failed; say which, do not hide it
        got.warning = (got.warning + " · " if got.warning else "") + f"fell back to {rung.name} ({'; '.join(notes)})"
    return got


def _llm(text: str) -> Extraction:
    provider = os.environ.get("DOCKRISK_EXTRACT_PROVIDER", "auto").lower()
    if provider == "auto":
        from . import llm
        provider = "openai" if llm.chain() else "anthropic"
    if provider == "openai":
        # No global model override: each rung names its own model, because the
        # sponsor endpoint and the proxy do not serve the same catalogue.
        return _openai(text)
    return _anthropic(text, os.environ.get("DOCKRISK_EXTRACT_MODEL", "claude-opus-5"))


def extract_terms(text: str, prefer_llm: bool = True) -> Extraction:
    if prefer_llm:
        try:
            return _llm(text)
        except Exception as e:  # no credentials, network, refusal — fall back, but say so
            if "authentication" in str(e).lower():
                warn = "No Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`); used the rules parser"
            elif "rate_limit" in str(e).lower() or type(e).__name__ == "RateLimitError":
                warn = "LLM provider rate-limited right now; used the rules parser — retry later for the Claude extraction"
            else:
                warn = f"LLM extraction unavailable ({type(e).__name__}: {str(e)[:80]}); used the rules parser"
            return Extraction(terms=_rules(text), source="extracted-rules", warning=warn)
    return Extraction(terms=_rules(text), source="extracted-rules")
