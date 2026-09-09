"""A customer detention notice, drafted from the evidence packet.

Same division of labour as the terms extractor: the engine computed every number and timestamp; the model only
writes the prose around them and is told it may not add, round or infer facts. Every draft says which path
produced it, and a dispatcher edits it before anything is sent. Without credentials or when the provider is
down, a plain template produces the same notice from the same fields.
"""
from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field


class Notice(BaseModel):
    subject: str = Field(description="One-line email subject naming the bill number and the facility")
    body: str = Field(description="The notice, plain business English, short paragraphs, no legal threats, no markdown")
    facts_used: list[str] = Field(default_factory=list, description="Each timestamp, duration, rate or amount from the packet that the body relies on, verbatim")
    caveats: list[str] = Field(default_factory=list, description="Anything the dispatcher must check before sending, e.g. review reasons in the packet")


class NoticeDraft(BaseModel):
    notice: Notice
    source: Literal["drafted-llm", "drafted-template"]
    provider: str | None = None
    model: str | None = None
    warning: str | None = None


SYSTEM = (
    "You draft detention (dock waiting) notices that a trucking carrier sends to a shipper or consignee. "
    "You are given a structured evidence packet: timestamps, durations, the customer's detention terms, the computed amount, and review flags. "
    "Write only from those fields. Do not invent, round, or infer any time, duration, rate or amount; copy them exactly. "
    "Tone: courteous, factual, brief. Ask the customer to confirm the in/out times. If the packet carries review reasons, "
    "list them in caveats and keep the body conditional ('subject to confirmation'). Never mention that a model wrote this."
)

_t = lambda ts: (str(ts)[11:16] if ts else "—")  # noqa: E731
_d = lambda ts: (str(ts)[:10] if ts else "—")  # noqa: E731


def facts(packet: dict, terms: dict | None) -> dict:
    """The fields the notice may use, in words the customer recognizes."""
    v, f, c = packet["visit"], packet["facility"], packet.get("calculation") or {}
    p = c.get("policy") or {}
    rule = {"max_checkin_appointment": "the later of driver check-in and the scheduled appointment", "arrival": "arrival at the property",
            "appointment": "the scheduled appointment time", "dock_in": "door assignment"}.get(str(p.get("billing_start_rule")), str(p.get("billing_start_rule")))
    return {
        "customer": f.get("customer") or terms and terms.get("customer") or "the facility",
        "facility": f.get("name"), "city": f.get("city"), "party": "shipper" if v.get("stop_kind") == "pickup" else "consignee",
        "bill_number": v.get("bill_number"), "date": _d(v.get("property_entered_ts")), "unit": v.get("unit"), "driver": v.get("driver_name"),
        "appointment": _t(v.get("appointment_start_ts")), "arrived": _t(v.get("property_entered_ts")), "checked_in": _t(v.get("checked_in_ts")),
        "at_dock": _t(v.get("at_dock_ts")), "loading_done": _t(v.get("service_complete_ts")), "released": _t(v.get("released_ts")), "left": _t(v.get("gate_exited_ts")),
        "physical_dwell_min": c.get("physical_dwell_min"), "qualifying_dwell_min": c.get("qualifying_dwell_min"),
        "clock_start": _t(c.get("clock_start_ts")), "clock_end": _t(c.get("clock_end_ts")), "clock_rule": rule,
        "free_time_min": p.get("free_time_min"), "rate_per_hour": p.get("rate_per_hour"), "increment_min": p.get("increment_min"),
        "billable_min": c.get("billable_min"), "amount": c.get("amount"), "policy_source": p.get("source"),
        "review_reasons": c.get("review_reasons") or [], "on_time": v.get("on_time"),
        "evidence_available": ["GPS geofence entry and exit times", "driver app timestamps", "duty-status log"] + (["appointment record"] if v.get("appointment_start_ts") else []),
    }


def _template(x: dict) -> Notice:
    h = lambda m: f"{int(m // 60)} h {int(m % 60):02d} min" if m is not None else "—"  # noqa: E731
    lines = [
        f"Dear {x['customer']},",
        "",
        f"On {x['date']}, our unit {x['unit']} (driver {x['driver']}) attended your {x['party']} facility, {x['facility']} in {x['city']}, for bill {x['bill_number']}.",
        f"The truck entered the property at {x['arrived']}" + (f" for a {x['appointment']} appointment" if x['appointment'] != "—" else "") +
        (f", checked in at {x['checked_in']}" if x['checked_in'] != "—" else "") + (f", was released at {x['released']}" if x['released'] != "—" else "") +
        (f" and left the property at {x['left']}." if x['left'] != "—" else "."),
        "",
        f"Under the detention terms on file ({x['policy_source']}), time counts from {x['clock_rule']} ({x['clock_start']}) with {x['free_time_min']} minutes free. "
        f"Qualifying time was {h(x['qualifying_dwell_min'])}, of which {x['billable_min']} minutes are billable in {x['increment_min']}-minute increments at ${x['rate_per_hour']}/hour: ${float(x['amount'] or 0):.2f}.",
        "",
        "Supporting records available on request: " + ", ".join(x["evidence_available"]) + ".",
        "Please confirm the in and out times above, or let us know if your records differ, within five business days.",
    ]
    caveats = list(x["review_reasons"])
    if x["on_time"] is None:
        caveats.append("driver's on-time arrival not confirmed")
    if caveats:
        lines.insert(-1, "This notice is subject to confirmation of: " + "; ".join(caveats) + ".")
        lines.insert(-1, "")
    lines += ["", "Regards,", "Dispatch"]
    facts_used = [f"entered {x['arrived']}", f"clock start {x['clock_start']}", f"free {x['free_time_min']} min", f"qualifying {x['qualifying_dwell_min']} min",
                  f"billable {x['billable_min']} min", f"rate ${x['rate_per_hour']}/h", f"amount ${float(x['amount'] or 0):.2f}"]
    return Notice(subject=f"Detention notice — bill {x['bill_number']}, {x['facility']}, {x['date']}", body="\n".join(lines), facts_used=facts_used, caveats=caveats)


def _user_prompt(x: dict) -> str:
    y = dict(x)
    y["rate_per_hour"] = f"${x['rate_per_hour']}/hour" if x.get("rate_per_hour") is not None else None
    y["amount"] = f"${float(x['amount'] or 0):.2f}"
    y["free_time_min"] = f"{x['free_time_min']} minutes" if x.get("free_time_min") is not None else None
    y["billable_min"] = f"{x['billable_min']} minutes" if x.get("billable_min") is not None else None
    return "Evidence packet (all values authoritative; copy money and times exactly as written, including the $ sign):\n" + "\n".join(f"{k}: {v}" for k, v in y.items())


def _openai(x: dict, model: str | None = None) -> NoticeDraft:
    """Walk `core.llm.chain()` — SPUR first, the proxy behind it."""
    from . import llm

    def once(rung: "llm.Rung") -> NoticeDraft:
        completion = rung.client().chat.completions.parse(
            model=model or rung.model,
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": _user_prompt(x)}],
            response_format=Notice,
        )
        msg = completion.choices[0].message
        if msg.refusal:
            raise RuntimeError(f"model refused: {msg.refusal}")
        return NoticeDraft(notice=msg.parsed, source="drafted-llm", provider=rung.name, model=model or rung.model)

    got, rung, notes = llm.call(once)
    if notes:
        got.warning = (got.warning + " · " if got.warning else "") + f"fell back to {rung.name} ({'; '.join(notes)})"
    return got


def _anthropic(x: dict, model: str) -> NoticeDraft:
    import anthropic
    client = anthropic.Anthropic()
    response = client.messages.parse(model=model, max_tokens=2048, system=SYSTEM, messages=[{"role": "user", "content": _user_prompt(x)}], output_format=Notice)
    return NoticeDraft(notice=response.parsed_output, source="drafted-llm", provider="anthropic", model=model)


def _check(draft: NoticeDraft, x: dict) -> NoticeDraft:
    """The one thing the model must not get wrong: the amount. If the body does not carry it verbatim, say so."""
    amt = f"{float(x['amount'] or 0):.2f}"
    if amt not in draft.notice.body:
        draft.warning = (draft.warning + " · " if draft.warning else "") + f"amount ${amt} not found verbatim in the draft; check before sending"
    return draft


def draft_notice(packet: dict, terms: dict | None = None, prefer_llm: bool = True) -> NoticeDraft:
    x = facts(packet, terms)
    if prefer_llm:
        provider = os.environ.get("DOCKRISK_EXTRACT_PROVIDER", "auto").lower()
        if provider == "auto":
            from . import llm
            provider = "openai" if llm.chain() else "anthropic"
        try:
            d = _openai(x) if provider == "openai" else _anthropic(x, os.environ.get("DOCKRISK_EXTRACT_MODEL", "claude-opus-5"))
            return _check(d, x)
        except Exception as e:
            warn = f"LLM drafting unavailable ({type(e).__name__}: {str(e)[:80]}); used the template"
            return NoticeDraft(notice=_template(x), source="drafted-template", warning=warn)
    return NoticeDraft(notice=_template(x), source="drafted-template")
