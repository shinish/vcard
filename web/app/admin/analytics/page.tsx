"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import TrendChart from "../../components/TrendChart";
import { Icon, type IconName, SocialMark, socialOf } from "../../components/icons";
import {
  ANALYTICS_DAYS,
  type Analytics,
  type Company,
  EVENT_LABELS,
  EVENT_TINTS,
  api,
  apiJson,
  companyLabel,
} from "../../lib/api";

const RANGE_LABELS: Record<number, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
  365: "Last 12 months",
};

const TILES: { key: "views" | "visitors" | "clicks" | "shares"; label: string; icon: IconName }[] = [
  { key: "views", label: "Total views", icon: "eye" },
  { key: "visitors", label: "Visitors", icon: "people" },
  { key: "clicks", label: "Total clicks", icon: "tap" },
  { key: "shares", label: "Shares", icon: "share" },
];

/** A date the way the mock-up writes one: 1 Oct 2026. */
function pretty(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [companyId, setCompanyId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("company") ?? "");
  const [contactId, setContactId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [people, setPeople] = useState<{ id: number; first_name: string; last_name: string | null }[]>(
    [],
  );
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailed, setMailed] = useState<string | null>(null);
  const [mailing, setMailing] = useState(false);
  const [allCards, setAllCards] = useState(false);
  const [allSources, setAllSources] = useState(false);

  useEffect(() => {
    apiJson<Company[]>("/api/admin/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const scope = companyId ? `?company_id=${companyId}` : "";
    apiJson<{ id: number; first_name: string; last_name: string | null }[]>(
      `/api/admin/contacts${scope}`,
    )
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [companyId]);

  useEffect(() => {
    const scope = contactId
      ? `&contact_id=${contactId}`
      : companyId
        ? `&company_id=${companyId}`
        : "";
    const range = from && to ? `&start=${from}&end=${to}` : "";
    apiJson<Analytics>(`/api/admin/analytics?days=${days}&grain=${grain}${scope}${range}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [days, companyId, contactId, from, to, grain]);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ["day", "views", "taps"],
      ...data.series.map((d) => [d.day, d.views, d.clicks]),
      [],
      ["action", "taps", "change %"],
      ...data.actions.map((a) => [EVENT_LABELS[a.kind] ?? a.kind, a.n, a.change ?? ""]),
      [],
      ["person", "company", "views", "taps", "saves"],
      ...data.top.map((t) => [
        [t.first_name, t.last_name].filter(Boolean).join(" "),
        t.branch ? `${t.company} — ${t.branch}` : t.company,
        t.views,
        t.clicks,
        t.saves,
      ]),
      [],
      ["source", "views"],
      ...data.sources.map((s) => [s.source, s.n]),
      [],
      ["device", "views"],
      ...data.devices.map((d) => [d.device, d.n]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-analytics-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailReport() {
    setMailing(true);
    setMailed(null);
    setError(null);
    try {
      const scope = companyId ? `&company_id=${companyId}` : "";
      const res = await api(`/api/admin/analytics/email?days=${data?.days ?? days}${scope}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Could not send it (${res.status}).`);
      setMailed(`Sent to ${body.sent_to}.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setMailing(false);
    }
  }

  const company = companies.find((c) => String(c.id) === companyId) ?? null;
  const totalViews = Math.max(1, data?.totals.views ?? 1);
  const shownCards = allCards ? data?.top ?? [] : (data?.top ?? []).slice(0, 5);
  const shownSources = allSources ? data?.sources ?? [] : (data?.sources ?? []).slice(0, 5);

  return (
    <div className="analytics-page">
      <nav className="mb-4 flex items-center gap-2 text-sm">
        <span className="font-semibold text-ink-soft">Analytics</span>
        {company ? (
          <>
            <span aria-hidden="true" className="text-ink-soft">
              /
            </span>
            <Link
              href={`/admin/companies/${company.id}`}
              className="truncate font-semibold text-brand-ink hover:underline"
            >
              {companyLabel(company)}
            </Link>
          </>
        ) : null}
      </nav>

      {/* --- Who and when ------------------------------------------------- */}
      <header className="analytics-header mb-6">
        <div className="flex flex-wrap items-center gap-5">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-line bg-wash p-2">
          {company?.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API
            <img
              src={`/api/admin/companies/${company.id}/logo.png?v=${company.logo_path}`}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Icon name="chart" className="size-6 text-ink-soft" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold">
              {company ? company.name : "All companies"}
            </h1>
            {company ? (
              <span
                className={`${
                  company.public_sharing ? "badge-live" : "badge-off"
                }`}
              >
                {company.public_sharing ? "Shared" : "Not shared"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {data
              ? `Cards opened between ${pretty(data.from)} and ${pretty(data.to)}. `
              : "Counting… "}
            Track engagement with your digital contact cards.
          </p>
        </div>

        </div>

        <div className="analytics-filters mt-5 flex flex-wrap items-center gap-2">
          <select
            value={from && to ? "custom" : String(days)}
            onChange={(e) => {
              setData(null);
              if (e.target.value === "custom") {
                const end = new Date();
                const begin = new Date(end);
                begin.setDate(end.getDate() - (days - 1));
                setFrom(begin.toISOString().slice(0, 10));
                setTo(end.toISOString().slice(0, 10));
                return;
              }
              setFrom("");
              setTo("");
              setDays(Number(e.target.value));
            }}
            aria-label="Period"
            className="field w-auto bg-paper text-sm"
          >
            {ANALYTICS_DAYS.map((d) => (
              <option key={d} value={d}>
                {RANGE_LABELS[d]}
              </option>
            ))}
            <option value="custom">Between two dates…</option>
          </select>

          {from && to ? (
            <span className="flex items-center gap-1.5 text-sm">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => { setData(null); setFrom(e.target.value); }}
                aria-label="From"
                className="field w-auto text-sm"
              />
              <span className="text-ink-soft">to</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => { setData(null); setTo(e.target.value); }}
                aria-label="To"
                className="field w-auto text-sm"
              />
            </span>
          ) : null}

          <select
            value={companyId}
            onChange={(e) => { setData(null); setContactId(""); setCompanyId(e.target.value); }}
            aria-label="Company"
            className="field w-auto bg-paper text-sm"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {companyLabel(c)}
              </option>
            ))}
          </select>

          <select
            value={contactId}
            onChange={(e) => { setData(null); setContactId(e.target.value); }}
            aria-label="Person"
            className="field w-auto bg-paper text-sm"
          >
            <option value="">All team members</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {[person.first_name, person.last_name].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>

          <button type="button" onClick={exportCsv} disabled={!data} className="btn btn-primary">
            <Icon name="download" className="size-4" />
            Export report
          </button>
          <button
            type="button"
            onClick={emailReport}
            disabled={!data || mailing}
            className="btn"
            title="Email this report to the notification address"
          >
            <Icon name="mail" className="size-4" />
            {mailing ? "Sending…" : "Email it"}
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {mailed ? (
        <p aria-live="polite" className="confirm mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {mailed}
        </p>
      ) : null}

      {!data ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          {/* --- The five figures ----------------------------------------- */}
          <div className="analytics-metrics mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {TILES.map((tile) => (
              <Tile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                value={data.totals[tile.key]}
                change={data.change[tile.key as keyof typeof data.change] ?? null}
              />
            ))}
            <Tile
              icon="card"
              label="Cards with traffic"
              value={data.totals.active_cards}
              suffix={` / ${data.totals.cards}`}
              footer={`${Math.max(0, data.totals.cards - data.totals.active_cards)} quiet`}
            />
          </div>

          {/* --- The chart and the gap where countries would be ------------ */}
          <div className="analytics-chart-grid mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <section className="surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">Views and clicks</h2>
                <select
                  value={grain}
                  onChange={(e) => { setData(null); setGrain(e.target.value as "day" | "week" | "month"); }}
                  aria-label="Group by"
                  className="field w-auto bg-paper text-sm"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </div>
              <TrendChart series={data.series} />
            </section>

            <section className="analytics-devices surface p-5">
              <h2 className="font-display text-lg font-bold">Devices</h2>
              <p className="mt-1 text-xs text-ink-soft">How people open your cards.</p>
              <Donut slices={data.devices.map((d) => ({ label: d.device, value: d.n }))} total={data.totals.views} />
              <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">Visitor locations are not collected.</p>
            </section>
          </div>

          {/* --- Cards, actions, devices, referrers ------------------------ */}
          <div className="analytics-detail-grid grid gap-5">
            <section className="surface overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line p-5">
                <div>
                  <h2 className="font-display text-lg font-bold">Top performing cards</h2>
                  <p className="text-sm text-ink-soft">Most opened in this period.</p>
                </div>
                {data.top.length > 5 ? (
                  <button
                    type="button"
                    onClick={() => setAllCards((v) => !v)}
                    className="text-sm font-semibold text-brand-ink hover:underline"
                  >
                    {allCards ? "Show top five" : "View all"}
                  </button>
                ) : null}
              </div>
              {data.top.length === 0 ? (
                <p className="p-5 text-sm text-ink-soft">Nothing opened yet in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                      <th className="w-10 p-3 font-semibold">#</th>
                      <th className="p-3 font-semibold">Person</th>
                      <th className="p-3 text-right font-semibold">Card views</th>
                      <th className="p-3 text-right font-semibold">Taps</th>
                      <th className="p-3 text-right font-semibold">Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownCards.map((row, i) => (
                      <tr key={row.id} className="border-b border-line last:border-0">
                        <td className="p-3 font-mono text-xs text-ink-soft">{i + 1}</td>
                        <td className="p-3">
                          <span className="flex items-center gap-3">
                            {row.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                              <img
                                src={row.photo_url}
                                alt=""
                                className="size-9 shrink-0 rounded-full border border-line object-cover"
                              />
                            ) : (
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-[11px] text-ink-soft">
                                {(row.first_name?.[0] ?? "") + (row.last_name?.[0] ?? "")}
                              </span>
                            )}
                            <span className="min-w-0">
                              <Link
                                href={`/admin/contacts/${row.id}`}
                                className="block truncate font-semibold text-brand-ink hover:underline"
                              >
                                {[row.first_name, row.last_name].filter(Boolean).join(" ")}
                              </Link>
                              <span className="block truncate text-xs text-ink-soft">
                                {row.job_title ||
                                  (row.branch ? `${row.company} — ${row.branch}` : row.company)}
                              </span>
                            </span>
                          </span>
                        </td>
                        {(["views", "clicks", "saves"] as const).map((key) => (
                          <td key={key} className="p-3 text-right">
                            <span className="font-mono">{row[key]}</span>
                            <Delta value={row.change[key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="analytics-secondary space-y-5">
              <section className="surface p-5">
                <h2 className="font-display text-lg font-bold">Top clicked actions</h2>
                {data.actions.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">No taps yet in this period.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {data.actions.map((a) => (
                      <li key={a.kind} className="flex items-center gap-3 py-2.5 text-sm">
                        <span
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
                          style={{ background: EVENT_TINTS[a.kind] ?? "#5b6b7f" }}
                        >
                          <Icon name={iconFor(a.kind)} className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {EVENT_LABELS[a.kind] ?? a.kind}
                        </span>
                        <span className="font-mono text-xs">{a.n}</span>
                        <Delta value={a.change} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">Referrers</h2>
                  {data.sources.length > 5 ? (
                    <button
                      type="button"
                      onClick={() => setAllSources((v) => !v)}
                      className="text-sm font-semibold text-brand-ink hover:underline"
                    >
                      {allSources ? "Show top five" : "View all"}
                    </button>
                  ) : null}
                </div>
                {data.sources.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">Nothing yet in this period.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {shownSources.map((s) => {
                      const mark = socialOf(s.source, s.source);
                      return (
                        <li key={s.source} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="tile-icon size-9 shrink-0">
                            {mark ? (
                              <SocialMark name={mark} className="size-4" />
                            ) : (
                              <Icon name="link" className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">{s.source}</span>
                          <span className="font-mono text-xs">{s.n}</span>
                          <span className="w-10 text-right text-xs text-ink-soft">
                            {Math.round((s.n * 100) / totalViews)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function iconFor(kind: string): IconName {
  const map: Record<string, IconName> = {
    call: "phone",
    email: "mail",
    website: "globe",
    map: "pin",
    share: "share",
    save: "download",
    qr: "qr",
    signature: "mail",
  };
  return map[kind] ?? "link";
}

/** A change figure, with the arrow carrying the direction rather than colour
 *  alone — the colour is a repeat, not the message. */
function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className={`ml-2 inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        up ? "text-[#1aa260]" : "text-[#c2410c]"
      }`}
    >
      <Icon name={up ? "trend-up" : "trend-down"} className="size-3" />
      {Math.abs(value)}%
    </span>
  );
}

function Tile({
  icon,
  label,
  value,
  change,
  suffix,
  footer,
}: {
  icon: IconName;
  label: string;
  value: number;
  change?: number | null;
  suffix?: string;
  footer?: string;
}) {
  return (
    <div className="analytics-metric surface p-4">
      <span className="tile-icon size-10">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="mt-3 text-sm text-ink-soft">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1 font-display text-3xl font-bold">
        {value.toLocaleString()}
        {suffix ? <span className="text-lg text-ink-soft">{suffix}</span> : null}
        {change !== undefined ? <Delta value={change ?? null} /> : null}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {footer ?? (change === null || change === undefined ? "No earlier period" : "vs the period before")}
      </p>
    </div>
  );
}

/** Devices as a ring. One circle per slice, each offset by what came before:
 *  stroke-dasharray is the whole mechanism, so there is no chart library and
 *  no path arithmetic to get wrong. */
function Donut({ slices, total }: { slices: { label: string; value: number }[]; total: number }) {
  const sum = slices.reduce((n, s) => n + s.value, 0) || 1;
  // One hue, light to dark: a share of a whole is magnitude, not identity.
  const tints = ["#0067ff", "#00b8be", "#7950f2", "#b7d9ff"];
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  if (!slices.length) {
    return <p className="mt-2 text-sm text-ink-soft">Nothing yet in this period.</p>;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-36 shrink-0" role="img" aria-label="Views by device">
        {slices.map((slice, i) => {
          const share = slice.value / sum;
          const dash = `${share * circumference} ${circumference}`;
          const preceding = slices.slice(0, i).reduce((n, s) => n + s.value, 0);
          const offset = -(preceding / sum) * circumference;
          return (
            <circle
              key={slice.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={tints[i % tints.length]}
              strokeWidth="18"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
            >
              <title>{`${slice.label}: ${slice.value}`}</title>
            </circle>
          );
        })}
        <text x="70" y="66" textAnchor="middle" className="fill-ink text-[18px] font-bold">
          {total.toLocaleString()}
        </text>
        <text x="70" y="82" textAnchor="middle" className="fill-ink-soft text-[9px]">
          total views
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: tints[i % tints.length] }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold capitalize">{slice.label}</span>
            <span className="text-xs text-ink-soft">
              {Math.round((slice.value * 100) / sum)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
