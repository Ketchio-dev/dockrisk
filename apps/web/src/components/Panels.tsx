"use client";
import { useEffect, useState } from "react";
import { api, fmtH, fmtMin, hhmm, type Candidate, type Charge } from "@/lib/api";

export function ChargesList({ charges }: { charges: Charge[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? charges : charges.slice(0, 3);
  const approve = async (id: number, status: string) => { setBusy(id); try { await api(`/charges/${id}/approve`, { method: "POST", body: JSON.stringify({ actor: "dispatcher", status }) }); } finally { setBusy(null); } };
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between"><h2 className="h">Detention charges</h2><span className="label">drafts from this run · engine-computed</span></div>
      <table className="ledger table-fixed text-xs">
        <colgroup><col /><col className="w-[64px]" /><col className="w-[56px]" /><col className="w-[68px]" /><col className="w-[108px]" /></colgroup>
        <thead><tr><th className="text-left">Stop</th><th className="r pr-2">Qualifying</th><th className="r pr-2">Billable</th><th className="r pr-2">Amount</th><th className="r">Status</th></tr></thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.charge_id}>
              <td className="pr-2">
                <div className="truncate">{c.facility_name} <span className="mono ink-3">· {c.bill_number ?? "no bill"}</span> · <a href={`/evidence/${c.visit_id}`} target="_blank">Packet</a></div>
                <div className="text-[11px] ink-3">{c.party}{c.review_required ? <span className="t-warn" title={c.reason_codes.join("; ")}> · {c.reason_codes.length} to review</span> : " · ready"}</div>
              </td>
              <td className="num r pr-2">{fmtMin(c.qualifying_dwell_min)}</td>
              <td className="num r pr-2">{c.billable_min}m</td>
              <td className="display r pr-2 text-[14px]">${c.amount.toFixed(2)}</td>
              <td className="r" style={{ paddingTop: 5, paddingBottom: 5 }}>
                {c.status === "draft" ? (
                  <button disabled={busy === c.charge_id} onClick={() => approve(c.charge_id, "approved")} title={c.review_required ? "Approving acknowledges the review reasons listed" : "Approve draft"} className="btn btn-sm">{c.review_required ? "Approve, noted" : "Approve"}</button>
                ) : <span className="ink-3">{c.status}</span>}
              </td>
            </tr>
          ))}
          {charges.length === 0 && <tr><td colSpan={5} className="ink-3">No visits closed yet.</td></tr>}
        </tbody>
      </table>
      {charges.length > 3 && <button onClick={() => setAll((v) => !v)} className="btn btn-sm btn-text mt-1 text-xs">{all ? "Latest three" : `All ${charges.length}`}</button>}
    </section>
  );
}

export function RescuePanel({ bill, excludeDriver, onClose }: { bill: string; excludeDriver: string | null; onClose: () => void }) {
  // results are keyed by the request they answer, so a new bill/driver shows the wait state without a clearing setState in the effect
  const key = `${bill}|${excludeDriver ?? ""}`;
  const [res, setRes] = useState<{ key: string; data?: { candidates: Candidate[]; load: Record<string, unknown> }; err?: string } | null>(null);
  const data = res?.key === key ? res.data ?? null : null;
  const err = res?.key === key ? res.err ?? null : null;
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ candidates: Candidate[]; load: Record<string, unknown> }>(`/rescue/${bill}${excludeDriver ? `?exclude_driver=${excludeDriver}` : ""}`)
      .then((d) => live && setRes({ key, data: d })).catch((e) => live && setRes({ key, err: String(e) }));
    return () => { live = false; };
  }, [bill, excludeDriver, key]);
  const assign = async (c: Candidate) => {
    if (pending || done) return;
    setPending(true);
    try {
      await api("/assignments", { method: "POST", body: JSON.stringify({ bill_number: bill, driver_name: c.driver_name, unit: c.unit, status: "offered",
        reason: { via: "rescue", reasons: c.reasons, pickup_by_start: (data?.load as { pickup_by_start?: string })?.pickup_by_start, pickup_by_end: (data?.load as { pickup_by_end?: string })?.pickup_by_end } }) });
      setDone(c.driver_name);
    } catch (e) { setRes({ key, data: data ?? undefined, err: String(e) }); } finally { setPending(false); }
  };
  const load = data?.load as { orig_city?: string; dest_city?: string; pickup_by_start?: string; pickup_by_end?: string } | undefined;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6" style={{ background: "rgba(26,26,23,.45)" }} onClick={onClose}>
      <div className="surface w-full max-w-3xl p-5 shadow-xl" style={{ borderRadius: 6, border: "1px solid var(--rule-strong)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="h text-[17px]">Relief driver for <span className="mono">{bill}</span>{load?.pickup_by_end ? <span className="ink-3 font-normal"> · pickup {hhmm(load.pickup_by_start)}–{hhmm(load.pickup_by_end)}</span> : null}</h3>
          <button onClick={onClose} className="btn btn-sm">Close</button>
        </div>
        <p className="mb-3 text-xs ink-3">Eligibility filters (position, appointment, trailer, hours plan) then ranking. A driver who fails a filter is shown with the reason; if nobody is legal, that is the answer.</p>
        {err && <p className="text-sm t-bad">{err}</p>}
        {!data && !err && <p className="text-sm ink-3">Checking position, hours, trailer and the pickup window for every truck…</p>}
        {data && data.candidates.length === 0 && <p className="text-sm ink-3">No trucks with telemetry to rank.</p>}
        {data && (
          <ul>
            {data.candidates.map((c) => (
              <li key={c.driver_name} className={`flex items-center justify-between gap-3 rule-b py-2.5 pl-3 text-sm ${c.eligible ? "bar-ok" : "bar-none opacity-70"}`}>
                <div>
                  <div className="font-medium">{c.driver_name} <span className="mono ink-3 font-normal">{c.unit}</span> <span className="num ml-2 text-xs ink-3">{c.deadhead_km} km · ETA {hhmm(c.eta)}{c.road_extra_h > 0 && <span className="t-warn"> (+{Math.round(c.road_extra_h * 60)} min road)</span>} · hours margin {fmtH(c.hos_margin_h)}</span></div>
                  <div className="text-xs ink-3">{c.reasons.filter((r) => !/^deadhead/.test(r)).map((r) => r.replace("trailer unknown ok", "trailer not on file")).join(" · ")}</div>
                  {c.blockers.length > 0 && <div className="text-xs t-bad">{c.blockers.join(" · ")}</div>}
                </div>
                {c.eligible && (done === c.driver_name ? <span className="text-xs t-ok">Offered — waiting for the driver</span> :
                  <button disabled={pending || !!done} onClick={() => assign(c)} className="btn btn-sm btn-primary">{done ? "Offered elsewhere" : "Offer load"}</button>)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
