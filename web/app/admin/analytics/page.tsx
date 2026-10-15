"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import TrendChart from "../../components/TrendChart";
import { Icon } from "../../components/icons";
import {
  ANALYTICS_DAYS,
  type Analytics,
  type Company,
  EVENT_LABELS,
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

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  // Empty dates mean "the last N days"; filling both switches to that range.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [people, setPeople] = useState<{ id: number; first_name: string; last_name: string | null }[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mailed, setMailed] = useState<string | null>(null);
  const [mailing, setMailing] = useState(false);

  // Arriving from a company's own Settings tab, which passes ?company=.
  // Read after mount rather than during render: the server has no query to
  // match and the two would disagree.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("company");
    if (asked) setCompanyId(asked);
  }, []);

  useEffect(() => {
    apiJson<Company[]>("/api/admin/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);

  // The people list follows the company filter, so the two agree.
  useEffect(() => {
    setContactId("");
    const scope = companyId ? `?company_id=${companyId}` : "";
    apiJson<{ id: number; first_name: string; last_name: string | null }[]>(
      `/api/admin/contacts${scope}`,
    )
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [companyId]);

  useEffect(() => {
    setData(null);
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
      ["action", "taps"],
      ...data.actions.map((a) => [EVENT_LABELS[a.kind] ?? a.kind, a.n]),
      [],
      ["person", "company", "views", "taps", "saves"],
      ...data.top.map((t) => [
        [t.first_name, t.last_name].filter(Boolean).join(" "),
        t.branch ? `${t.company} — ${t.branch}` : t.company,
        t.views,
        t.clicks,
        t.saves,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
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

  const peakAction = data?.actions[0]?.n ?? 0;
  const peakDevice = data?.devices[0]?.n ?? 0;
  const peakSource = data?.sources[0]?.n ?? 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-ink-soft">
            What the share links did
            {data ? ` between ${data.from} and ${data.to}` : ""}. Counted on the card itself. No
            address is stored: a visitor is a salted hash that is re-salted every day, so the same
            phone on two days counts twice and nobody can be followed between them.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={from && to ? "custom" : String(days)}
            onChange={(e) => {
              if (e.target.value === "custom") {
                // seed the pickers with the window currently shown
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
            className="field w-auto text-sm"
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
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From"
                className="field w-auto text-sm"
              />
              <span className="text-ink-soft">to</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To"
                className="field w-auto text-sm"
              />
            </span>
          ) : null}

          <select
            value={grain}
            onChange={(e) => setGrain(e.target.value as "day" | "week" | "month")}
            aria-label="Group by"
            className="field w-auto text-sm"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            aria-label="Company"
            className="field w-auto text-sm"
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
            onChange={(e) => setContactId(e.target.value)}
            aria-label="Person"
            className="field w-auto text-sm"
          >
            <option value="">Everyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {[person.first_name, person.last_name].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>

          <button type="button" onClick={exportCsv} disabled={!data} className="btn">
            <Icon name="download" className="size-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={emailReport}
            disabled={!data || mailing}
            className="btn btn-primary"
          >
            <Icon name="mail" className="size-4" />
            {mailing ? "Sending…" : "Email this report"}
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-cyan-deep bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {mailed ? (
        <p aria-live="polite" className="confirm mb-5 rounded-lg border-l-2 border-cyan-deep bg-paper px-3 py-2 text-sm">
          {mailed}
        </p>
      ) : null}

      {!data ? (
        <p className="text-ink-soft">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Tile label="Card views" value={data.totals.views} change={data.change.views} />
            <Tile
              label="Visitors"
              value={data.totals.visitors}
              change={data.change.visitors}
              hint="Counted once a day each"
            />
            <Tile label="Taps on the card" value={data.totals.clicks} change={data.change.clicks} />
            <Tile label="Saved to a phone" value={data.totals.saves} change={data.change.saves} />
            <Tile label="Shared on" value={data.totals.shares} change={data.change.shares} />
            <Tile
              label="Cards with traffic"
              value={data.totals.active_cards}
              hint={`of ${data.totals.cards} ${data.totals.cards === 1 ? "card" : "cards"}`}
            />
          </div>

          <section className="surface mb-6 p-6">
            <h2 className="font-display text-lg font-bold">Views and taps</h2>
            <p className="mb-4 text-sm text-ink-soft">
              One point per {data.grain === "day" ? "day" : data.grain}. Hover it to read it out.
            </p>
            <TrendChart series={data.series} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="surface overflow-hidden">
              <div className="border-b border-line p-5">
                <h2 className="font-display text-lg font-bold">Busiest cards</h2>
                <p className="text-sm text-ink-soft">Most opened in this period.</p>
              </div>
              {data.top.length === 0 ? (
                <p className="p-5 text-sm text-ink-soft">Nothing opened yet in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                      <th className="p-3 font-semibold">Person</th>
                      <th className="p-3 text-right font-semibold">Views</th>
                      <th className="p-3 text-right font-semibold">Taps</th>
                      <th className="p-3 text-right font-semibold">Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top.map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="p-3">
                          <Link
                            href={`/admin/contacts/${t.id}`}
                            className="font-semibold text-cyan-ink hover:underline"
                          >
                            {[t.first_name, t.last_name].filter(Boolean).join(" ")}
                          </Link>
                          <span className="block text-xs text-ink-soft">
                            {[t.job_title, t.branch ? `${t.company} — ${t.branch}` : t.company]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">{t.views}</td>
                        <td className="p-3 text-right font-mono">{t.clicks}</td>
                        <td className="p-3 text-right font-mono">{t.saves}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="space-y-6">
              <section className="surface p-5">
                <h2 className="font-display text-lg font-bold">What people tapped</h2>
                {data.actions.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">No taps yet in this period.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.actions.map((a) => (
                      <li key={a.kind} className="text-sm">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold">{EVENT_LABELS[a.kind] ?? a.kind}</span>
                          <span className="flex items-baseline gap-2">
                            {a.change !== null ? (
                              <span className="text-[11px] text-ink-soft">
                                {a.change >= 0 ? "↑" : "↓"} {Math.abs(a.change)}%
                              </span>
                            ) : null}
                            <span className="font-mono text-xs">{a.n}</span>
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 block h-1.5 rounded-full bg-wash"
                        >
                          <span
                            className="grad-rule block h-full rounded-full"
                            style={{ width: `${peakAction ? (a.n / peakAction) * 100 : 0}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="surface p-5">
                <h2 className="font-display text-lg font-bold">What they opened it on</h2>
                {data.devices.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">Nothing yet in this period.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.devices.map((d) => (
                      <li key={d.device} className="text-sm">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-semibold capitalize">{d.device}</span>
                          <span className="font-mono text-xs">
                            {d.n} · {Math.round((d.n * 100) / Math.max(1, data.totals.views))}%
                          </span>
                        </span>
                        <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-wash">
                          <span
                            className="grad-rule block h-full rounded-full"
                            style={{ width: `${peakDevice ? (d.n / peakDevice) * 100 : 0}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-ink-soft">
                  Read off the browser&rsquo;s user agent. No country here: that needs an
                  IP-geolocation service, and no address is stored.
                </p>
              </section>

              <section className="surface p-5">
                <h2 className="font-display text-lg font-bold">Where views came from</h2>
                <p className="text-sm text-ink-soft">
                  The QR code, a referring site, or the link pasted straight in.
                </p>
                {data.sources.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">Nothing yet in this period.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {data.sources.map((s) => (
                      <li key={s.source} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate font-semibold">{s.source}</span>
                        <span className="font-mono text-xs">{s.n}</span>
                        <span className="text-xs text-ink-soft">
                          {peakSource ? Math.round((s.n * 100) / data.totals.views) : 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Tile({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: number;
  change?: number | null;
  hint?: string;
}) {
  return (
    <div className="surface p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value.toLocaleString()}</p>
      {change !== undefined && change !== null ? (
        <p className="mt-1 text-xs font-semibold text-ink-soft">
          {change >= 0 ? "↑" : "↓"} {Math.abs(change)}% vs the period before
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-soft">{hint ?? "No earlier period to compare"}</p>
      )}
    </div>
  );
}
