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
  const load = () => api<Policy[]>("/policies").then(setPolicies);
  useEffect(() => { load(); }, []);
  const extract = async () => { setBusy(true); try { const r = await api<Extract>("/policies/extract", { method: "POST", body: JSON.stringify({ text, customer, prefer_llm: true }) }); setEx(r); setTerms(r.terms); } finally { setBusy(false); } };
  const confirm = async () => { if (!ex || !terms) return; setBusy(true); try { await api("/policies/confirm", { method: "POST", body: JSON.stringify({ customer, terms, source: ex.source, source_text: ex.source_text, confirmed_by: "dispatcher" }) }); await load(); setEx(null); setTerms(null); } finally { setBusy(false); } };
  const F = ({ k, label, type = "number" }: { k: keyof Terms; label: string; type?: string }) => (
    <label className="block text-[11px] text-slate-400">{label}
      <input type={type} value={(terms?.[k] as string | number | null) ?? ""} onChange={(e) => setTerms({ ...terms!, [k]: e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value })}
        className="mt-0.5 w-full rounded bg-slate-950 px-2 py-1 text-sm text-slate-100 ring-1 ring-slate-700" />
    </label>
  );
  return (
    <main className="mx-auto max-w-5xl p-5 text-slate-100">
      <header className="mb-4 flex items-baseline justify-between"><h1 className="text-lg font-semibold">Detention policies</h1><a href="/" className="text-sm text-cyan-400 hover:underline">← dispatcher</a></header>
      <p className="mb-4 text-sm text-slate-400">AI where language is messy, rules where money is precise: the model turns a rate confirmation into a draft with quoted evidence; you confirm it; the deterministic engine does every calculation.</p>
      <div className="grid grid-cols-2 gap-4">
        <section className="space-y-2">
          <label className="block text-[11px] text-slate-400">Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} className="mt-0.5 w-full rounded bg-slate-950 px-2 py-1 text-sm ring-1 ring-slate-700" /></label>
          <label className="block text-[11px] text-slate-400">Rate confirmation / agreement text
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mt-0.5 w-full rounded bg-slate-950 p-2 font-mono text-[12px] text-slate-200 ring-1 ring-slate-700" /></label>
          <button disabled={busy} onClick={extract} className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">{busy ? "Extracting…" : "Extract terms"}</button>
        </section>
        <section className="space-y-2">
          {!ex && <p className="text-sm text-slate-500">Extracted terms appear here for review.</p>}
          {ex && terms && (
            <>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`rounded px-2 py-0.5 ${ex.source === "extracted-llm" ? "bg-violet-900/60 text-violet-200" : "bg-slate-800 text-slate-300"}`}>{ex.source}{ex.provider ? ` · ${ex.provider}` : ""}{ex.model ? ` · ${ex.model}` : ""}</span>
                {ex.warning && <span className="text-amber-300">{ex.warning}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <F k="free_time_min" label="Free time (min)" /><F k="rate_per_hour" label="Rate ($/h)" />
                <F k="increment_min" label="Increment (min)" /><F k="maximum_charge" label="Max per stop ($)" />
                <F k="minimum_charge" label="Minimum ($)" />
                <label className="block text-[11px] text-slate-400">Clock starts
                  <select value={terms.billing_start_rule ?? "max_checkin_appointment"} onChange={(e) => setTerms({ ...terms, billing_start_rule: e.target.value })} className="mt-0.5 w-full rounded bg-slate-950 px-2 py-1 text-sm ring-1 ring-slate-700">
                    {["max_checkin_appointment", "arrival", "appointment", "dock_in"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!terms.requires_on_time_arrival} onChange={(e) => setTerms({ ...terms, requires_on_time_arrival: e.target.checked })} /> requires on-time arrival</label>
              <div className="text-[11px] text-slate-400">Required evidence: <span className="text-slate-200">{terms.required_evidence.join(", ") || "—"}</span> · applies to: <span className="text-slate-200">{terms.applies_to.join(", ") || "—"}</span></div>
              {terms.evidence_quotes.length > 0 && (
                <div className="rounded bg-slate-950 p-2 text-[11px] ring-1 ring-slate-800"><div className="mb-1 text-slate-500">Evidence quotes</div>
                  <ul className="list-disc space-y-0.5 pl-4 text-slate-300">{terms.evidence_quotes.map((q, i) => <li key={i}>“{q}”</li>)}</ul></div>
              )}
              {terms.notes && <div className="text-[11px] text-amber-300/90">{terms.notes}</div>}
              <button disabled={busy} onClick={confirm} className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50">Confirm &amp; activate for {customer}</button>
            </>
          )}
        </section>
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Active policies</h2>
        <table className="w-full text-[11px]">
          <thead className="text-slate-500"><tr><th className="text-left font-normal">Scope</th><th className="text-right font-normal">Free</th><th className="text-right font-normal">Rate</th><th className="text-right font-normal">Incr.</th><th className="text-right font-normal">Max</th><th className="text-left font-normal">Clock</th><th className="text-left font-normal">Source</th></tr></thead>
          <tbody>{policies.map((p) => (
            <tr key={p.policy_id} className="border-t border-slate-800"><td className="py-1">{p.scope}{p.customer ? ` · ${p.customer}` : ""}</td><td className="text-right">{p.free_time_min}m</td><td className="text-right">${p.rate_per_hour}/h</td><td className="text-right">{p.increment_min}m</td><td className="text-right">{p.maximum_charge ? `$${p.maximum_charge}` : "—"}</td><td>{p.billing_start_rule.replace(/_/g, " ")}{p.requires_on_time_arrival ? " · on-time req." : ""}</td><td className="text-slate-400">{p.source}{p.confirmed_by ? ` · ${p.confirmed_by}` : ""}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}
