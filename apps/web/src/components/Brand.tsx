import Link from "next/link";

/** The mark: a building with one open bay door. 18 px, ink. Used once per page, before the wordmark. */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <rect x="1" y="4" width="18" height="13" rx="1.5" fill="var(--ink)" />
      <rect x="11.5" y="9.5" width="5" height="7.5" fill="var(--surface)" />
      <rect x="3.5" y="7" width="5" height="1.5" fill="var(--surface)" opacity=".7" />
    </svg>
  );
}

const LINKS: [string, string][] = [["/", "Dispatch"], ["/data", "Data"], ["/policies", "Policies"], ["/driver", "Driver app"]];

/** Navigation as a short row of words; the current page is ink, the others grey. */
export function Nav({ current }: { current: string }) {
  return (
    <nav className="flex items-center gap-4 text-[13px]">
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} className={`plain whitespace-nowrap ${current === href ? "font-medium" : "ink-3"}`} aria-current={current === href ? "page" : undefined}
          style={current === href ? { boxShadow: "inset 0 -2px 0 var(--ink)", paddingBottom: 2 } : { paddingBottom: 2 }}>{label}</a>
      ))}
    </nav>
  );
}

/** Page header for the document-style pages (data, policies, driver, evidence). */
export function PageHeader({ title, kicker, current, right }: { title: string; kicker?: string; current: string; right?: React.ReactNode }) {
  return (
    <header className="rule-b mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link href="/" className="plain flex items-center gap-2" aria-label="DockRisk dispatch"><Mark /></Link>
        <div className="min-w-0">
          {kicker && <div className="label truncate">{kicker}</div>}
          <h1 className="display text-[22px]">{title}</h1>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4">{right}<Nav current={current} /></div>
    </header>
  );
}
