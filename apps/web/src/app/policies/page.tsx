"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Terms = { free_time_min: number | null; rate_per_hour: number | null; increment_min: number | null; minimum_charge: number | null; maximum_charge: number | null; billing_start_rule: string | null; requires_on_time_arrival: boolean | null; required_evidence: string[]; applies_to: string[]; evidence_quotes: string[]; notes: string | null };
type Extract = { customer: string | null; source: string; provider: string | null; model: string | null; warning: string | null; terms: Terms; source_text: string };
type Policy = { policy_id: number; scope: string; customer: string | null; free_time_min: number; rate_per_hour: number; increment_min: number; maximum_charge: number | null; billing_start_rule: string; requires_on_time_arrival: number; source: string; confirmed_by: string | null; created_ts: string | null };

const SAMPLE = `RATE CONFIRMATION — Lane: Milton, ON to London, ON. Rate: $650 flat.
Detention: 2 hours free time at shipper and consignee. $85.00 per hour thereafter, billed in 30-minute increments, not to exceed $500 per stop.
Detention counts from the later of driver check-in and the scheduled appointment time. Driver must be on time for the appointment; detention is not payable if the driver is late.
Carrier must provide in/out times signed by the facility and the BOL with the invoice.`;

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
    if (v == null || v === "" ) return null;
    return qs.find((q) => needles[k as string]?.test(q)) ?? null;
  };
  const F = ({ k, label, type = "number" }: { k: keyof Terms; label: string; type?: string }) => {
    const v = terms?.[k] as string | number | null;
    const clause = clauseFor(k);
    const unknown = v == null || v === "";
    return (
      <label className="block text-[11px] text-gray-500">{label}
        {unknown && DEFAULTS[k] !== undefined && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">not stated → default {String(DEFAULTS[k])} on confirm</span>}
        {unknown && DEFAULTS[k] === undefined && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">not stated</span>}
        <input type={type} value={v ?? ""} placeholder={DEFAULTS[k] !== undefined ? `default ${String(DEFAULTS[k])}` : "—"} onChange={(e) => setTerms({ ...terms!, [k]: e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value })}
          className={`mt-0.5 w-full rounded bg-white px-2 py-1 text-sm text-gray-900 ring-1 ${unknown ? "border-amber-300" : "border-gray-300"}`} />
        {clause && <div className="mt-0.5 truncate text-[10px] italic text-gray-500" title={clause}>“{clause}”</div>}
      </label>
    );
  };
  return (
    <main className="mx-auto max-w-5xl p-5 text-gray-900">
      <header className="mb-4 flex items-baseline justify-between"><h1 className="text-lg font-semibold">Detention policies</h1><a href="/" className="text-sm text-blue-700 hover:underline">← dispatcher</a></header>
      <p className="mb-4 text-sm text-gray-500">AI where language is messy, rules where money is precise: the model turns a rate confirmation into a draft with quoted evidence; you confirm it; the deterministic engine does every calculation.</p>
      <div className="grid grid-cols-2 gap-4">
        <section className="space-y-2">
          <label className="block text-[11px] text-gray-500">Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-0.5 w-full rounded bg-white px-2 py-1 text-sm border border-gray-300" /></label>
          <label className="block text-[11px] text-gray-500">Rate confirmation / agreement text
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mt-0.5 w-full rounded bg-white p-2 font-mono text-[12px] text-gray-800 border border-gray-300" /></label>
          <button disabled={busy} onClick={extract} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">{busy ? "Extracting…" : "Extract terms"}</button>
        </section>
        <section className="space-y-2">
          {!ex && activated && <div className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">Activated policy #{activated.policy_id} for <b>{activated.customer}</b>: {activated.free_time_min} min free · ${activated.rate_per_hour}/h · {activated.increment_min}-min increments{activated.maximum_charge ? ` · max $${activated.maximum_charge}` : ""} · clock from {activated.billing_start_rule.replace(/_/g, " ")}. New visits for this customer use it; the engine, not the model, computes every charge.</div>}
          {!ex && !activated && <p className="text-sm text-gray-500">Extracted terms appear here for review.</p>}
          {ex && terms && (
            <>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`rounded px-2 py-0.5 ${ex.source === "extracted-llm" ? "bg-violet-100 text-violet-800" : "bg-gray-100 text-gray-700"}`}>{ex.source}{ex.provider ? ` · ${ex.provider}` : ""}{ex.model ? ` · ${ex.model}` : ""}</span>
                {ex.warning && <span className="text-amber-700">{ex.warning}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F k="free_time_min" label="Free time (min)" /><F k="rate_per_hour" label="Rate ($/h)" />
                <F k="increment_min" label="Increment (min)" /><F k="maximum_charge" label="Max per stop ($)" />
                <F k="minimum_charge" label="Minimum ($)" />
                <label className="block text-[11px] text-gray-500">Clock starts
                  <select value={terms.billing_start_rule ?? "max_checkin_appointment"} onChange={(e) => setTerms({ ...terms, billing_start_rule: e.target.value })} className="mt-0.5 w-full rounded bg-white px-2 py-1 text-sm border border-gray-300">
                    {["max_checkin_appointment", "arrival", "appointment", "dock_in"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!terms.requires_on_time_arrival} onChange={(e) => setTerms({ ...terms, requires_on_time_arrival: e.target.checked })} /> requires on-time arrival</label>
              <div className="text-[11px] text-gray-500">Required evidence: <span className="text-gray-800">{terms.required_evidence.join(", ") || "—"}</span> · applies to: <span className="text-gray-800">{terms.applies_to.join(", ") || "—"}</span></div>
              {terms.evidence_quotes.length > 0 && (
                <details className="rounded bg-white p-2 text-[11px] border border-gray-200"><summary className="cursor-pointer text-gray-500">All {terms.evidence_quotes.length} evidence quotes</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-700">{terms.evidence_quotes.map((q, i) => <li key={i}>“{q}”</li>)}</ul></details>
              )}
              {terms.notes && <div className="text-[11px] text-amber-700">{terms.notes}</div>}
              <button disabled={busy} onClick={confirm} className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50">Confirm &amp; activate for {customer}</button>
            </>
          )}
        </section>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Active policies</h2>
        <table className="w-full text-[11px]">
          <thead className="text-gray-500"><tr><th className="text-left font-normal">Scope</th><th className="text-right font-normal">Free</th><th className="text-right font-normal">Rate</th><th className="text-right font-normal">Incr.</th><th className="text-right font-normal">Max</th><th className="text-left font-normal">Clock</th><th className="text-left font-normal">Source</th></tr></thead>
          <tbody>{policies.map((p) => (
            <tr key={p.policy_id} className="border-t border-gray-200"><td className="py-1">{p.scope}{p.customer ? ` · ${p.customer}` : ""}</td><td className="text-right">{p.free_time_min}m</td><td className="text-right">${p.rate_per_hour}/h</td><td className="text-right">{p.increment_min}m</td><td className="text-right">{p.maximum_charge ? `$${p.maximum_charge}` : "—"}</td><td>{p.billing_start_rule.replace(/_/g, " ")}{p.requires_on_time_arrival ? " · on-time req." : ""}</td><td className="text-gray-500">{p.source}{p.confirmed_by ? ` · ${p.confirmed_by}` : ""}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
