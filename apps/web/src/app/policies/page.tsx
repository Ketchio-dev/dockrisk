"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Brand";

type Terms = { free_time_min: number | null; rate_per_hour: number | null; increment_min: number | null; minimum_charge: number | null; maximum_charge: number | null; billing_start_rule: string | null; requires_on_time_arrival: boolean | null; required_evidence: string[]; applies_to: string[]; evidence_quotes: string[]; notes: string | null };
type Extract = { customer: string | null; source: string; provider: string | null; model: string | null; warning: string | null; terms: Terms; source_text: string };
type Policy = { policy_id: number; scope: string; customer: string | null; free_time_min: number; rate_per_hour: number; increment_min: number; maximum_charge: number | null; billing_start_rule: string; requires_on_time_arrival: number; source: string; confirmed_by: string | null; created_ts: string | null };

const SAMPLE = `RATE CONFIRMATION — Lane: Milton, ON to London, ON. Rate: $650 flat.
Detention: 2 hours free time at shipper and consignee. $85.00 per hour thereafter, billed in 30-minute increments, not to exceed $500 per stop.
Detention counts from the later of driver check-in and the scheduled appointment time. Driver must be on time for the appointment; detention is not payable if the driver is late.
Carrier must provide in/out times signed by the facility and the BOL with the invoice.`;

const RULE_WORD: Record<string, string> = { max_checkin_appointment: "later of check-in and appointment", arrival: "arrival", appointment: "appointment time", dock_in: "dock assignment" };

export default function Policies() {
  const [text, setText] = useState(SAMPLE);
  const [customer, setCustomer] = useState("ACME Foods");
  const [ex, setEx] = useState<Extract | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activated, setActivated] = useState<Policy | null>(null);
  const load = () => api<Policy[]>("/policies").then(setPolicies);
  useEffect(() => { load(); }, []);
  const extract = async () => { setBusy(true); try { const r = await api<Extract>("/policies/extract", { method: "POST", body: JSON.stringify({ text, customer, prefer_llm: true }) }); setEx(r); setTerms(r.terms); } finally { setBusy(false); } };
  const confirm = async () => { if (!ex || !terms) return; setBusy(true); try { const p = await api<Policy>("/policies/confirm", { method: "POST", body: JSON.stringify({ customer, terms, source: ex.source, source_text: ex.source_text, confirmed_by: "dispatcher" }) }); await load(); setActivated(p); setEx(null); setTerms(null); } finally { setBusy(false); } };
  const DEFAULTS: Partial<Record<keyof Terms, number | string | boolean>> = { free_time_min: 120, rate_per_hour: 75, increment_min: 15, minimum_charge: 0, billing_start_rule: "max_checkin_appointment", requires_on_time_arrival: true };
  const clauseFor = (k: keyof Terms): string | null => {
    if (!terms) return null;
    const v = terms[k];
    const qs = terms.evidence_quotes ?? [];
    const needles: Record<string, RegExp> = {
      free_time_min: /free|first\s+\d/i, rate_per_hour: /\$\s?\d+(\.\d+)?\s*(\/|per)\s*(hour|hr)/i, increment_min: /increment/i, maximum_charge: /max|exceed|cap/i,
      minimum_charge: /min(imum)?\b(?!ute)/i, billing_start_rule: /later of|from (the )?(arrival|appointment|check)/i, requires_on_time_arrival: /on[- ]time|late/i,
    };
    if (v == null || v === "") return null;
    return qs.find((q) => needles[k as string]?.test(q)) ?? null;
  };
  const F = ({ k, label, type = "number" }: { k: keyof Terms; label: string; type?: string }) => {
    const v = terms?.[k] as string | number | null;
    const clause = clauseFor(k);
    const unknown = v == null || v === "";
    return (
      <label className="block text-[11px] ink-3">
        <span className="flex items-baseline justify-between">{label}
          {unknown && <span className={`text-[10px] ${DEFAULTS[k] !== undefined ? "t-warn" : "ink-4"}`}>{DEFAULTS[k] !== undefined ? `not stated — default ${String(DEFAULTS[k])}` : "not stated"}</span>}
        </span>
        <input type={type} value={v ?? ""} placeholder={DEFAULTS[k] !== undefined ? `default ${String(DEFAULTS[k])}` : "—"} onChange={(e) => setTerms({ ...terms!, [k]: e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value })}
          className="field display mt-1 text-[16px]" style={{ height: 34, borderColor: unknown ? "#f0c69a" : undefined }} />
        {clause && <div className="mt-1 truncate text-[10px] italic ink-3" title={clause}>“{clause}”</div>}
      </label>
    );
  };
  return (
    <main className="mx-auto max-w-5xl px-6 py-5">
      <PageHeader title="Detention terms" kicker="Policies" current="/policies" />
      <p className="mb-6 max-w-2xl text-sm ink-2">The model reads a rate confirmation and drafts the detention terms with the clause it relied on under each field. You confirm them. The engine, not the model, computes every charge.</p>
      <div className="grid grid-cols-2 gap-8">
        <section className="space-y-3">
          <label className="block text-[11px] ink-3">Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="field mt-1" /></label>
          <label className="block text-[11px] ink-3">Rate confirmation or agreement text
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={13} className="field mono mt-1 w-full" style={{ fontSize: 12.5, background: "var(--surface)" }} /></label>
          <button disabled={busy} onClick={extract} className="btn btn-primary">{busy ? "Extracting…" : "Extract terms"}</button>
        </section>
        <section className="space-y-3">
          {!ex && activated && (
            <div className="bar-ok pl-3 text-sm">
              <div className="font-medium t-ok">Activated for {activated.customer}</div>
              <div className="ink-2">{activated.free_time_min} min free · ${activated.rate_per_hour}/h · {activated.increment_min}-min increments{activated.maximum_charge ? ` · max $${activated.maximum_charge}` : ""} · clock from {RULE_WORD[activated.billing_start_rule] ?? activated.billing_start_rule}. New visits for this customer use it.</div>
            </div>
          )}
          {!ex && !activated && <p className="text-sm ink-3">Extracted terms appear here for review.</p>}
          {ex && terms && (
            <>
              <div className="label flex items-center gap-2">
                <span>{ex.source === "extracted-llm" ? "Read by the model" : "Read by rules"}{ex.model ? ` · ${ex.model}` : ex.provider ? ` · ${ex.provider}` : ""} · the engine computes every charge</span>
                {ex.warning && <span className="t-warn">{ex.warning}</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F k="free_time_min" label="Free time, minutes" /><F k="rate_per_hour" label="Rate, $ per hour" />
                <F k="increment_min" label="Increment, minutes" /><F k="maximum_charge" label="Maximum per stop, $" />
                <F k="minimum_charge" label="Minimum, $" />
                <label className="block text-[11px] ink-3">Clock starts at
                  <select value={terms.billing_start_rule ?? "max_checkin_appointment"} onChange={(e) => setTerms({ ...terms, billing_start_rule: e.target.value })} className="field mt-1" style={{ height: 34 }}>
                    {Object.entries(RULE_WORD).map(([r, w]) => <option key={r} value={r}>{w}</option>)}
                  </select></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!terms.requires_on_time_arrival} onChange={(e) => setTerms({ ...terms, requires_on_time_arrival: e.target.checked })} /> requires on-time arrival</label>
              <div className="text-[11px] ink-3">Required evidence: <span className="ink-2">{terms.required_evidence.join(", ") || "—"}</span> · applies to: <span className="ink-2">{terms.applies_to.join(", ") || "—"}</span></div>
              {terms.evidence_quotes.length > 0 && (
                <details className="text-[11px]"><summary className="cursor-pointer ink-3">All {terms.evidence_quotes.length} clauses the model quoted</summary>
                  <ul className="mono mt-1 list-disc space-y-1 pl-4 ink-2">{terms.evidence_quotes.map((q, i) => <li key={i}>“{q}”</li>)}</ul></details>
              )}
              {terms.notes && <div className="text-[11px] t-warn">{terms.notes}</div>}
              <button disabled={busy} onClick={confirm} className="btn btn-primary">Confirm and activate for {customer}</button>
            </>
          )}
        </section>
      </div>
      <section className="mt-10">
        <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Active policies</h2><span className="label">facility overrides customer overrides default</span></div>
        <table className="ledger table-fixed text-xs">
          <colgroup><col /><col className="w-[72px]" /><col className="w-[80px]" /><col className="w-[64px]" /><col className="w-[72px]" /><col className="w-[240px]" /><col className="w-[200px]" /></colgroup>
          <thead><tr><th className="text-left">Scope</th><th className="r pr-3">Free</th><th className="r pr-3">Rate</th><th className="r pr-3">Incr.</th><th className="r pr-3">Cap</th><th className="text-left">Clock starts at</th><th className="text-left">Source</th></tr></thead>
          <tbody>{policies.map((p) => (
            <tr key={p.policy_id}><td className="font-medium">{p.scope === "default" ? "Default" : `${p.customer ?? p.scope}`}</td><td className="display r pr-3 text-[14px]">{p.free_time_min} min</td><td className="display r pr-3 text-[14px]">${p.rate_per_hour}/h</td><td className="display r pr-3 text-[14px]">{p.increment_min} min</td><td className="display r pr-3 text-[14px]">{p.maximum_charge ? `$${p.maximum_charge}` : "—"}</td><td className="ink-2">{RULE_WORD[p.billing_start_rule] ?? p.billing_start_rule.replace(/_/g, " ")}{p.requires_on_time_arrival ? ", on-time required" : ""}</td><td className="ink-3">{p.source}{p.confirmed_by ? ` · ${p.confirmed_by}` : ""}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
