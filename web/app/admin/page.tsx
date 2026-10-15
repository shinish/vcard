"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon, type IconName } from "../components/icons";
import {
  type Analytics,
  type Dashboard,
  type Me,
  apiJson,
  companyLabel,
} from "../lib/api";

/** The four figures across the top, each with the series it is drawn from. */
const TILES = [
  {
    key: "contacts",
    label: "People with cards",
    icon: "people" as IconName,
    tint: "#2563eb",
    wash: "#eff6ff",
    series: "new_cards" as const,
    change: "new_cards" as const,
    note: "new in this period",
  },
  {
    key: "active",
    label: "Cards with traffic",
    icon: "card" as IconName,
    tint: "#10b981",
    wash: "#ecfdf5",
    series: "views" as const,
    change: "active_cards" as const,
    note: "vs the period before",
  },
  {
    key: "views",
    label: "Card views",
    icon: "eye" as IconName,
    tint: "#7c3aed",
    wash: "#f5f3ff",
    series: "views" as const,
    change: "views" as const,
    note: "vs the period before",
  },
  {
    key: "saves",
    label: "Saved to a phone",
    icon: "download" as IconName,
    tint: "#f97316",
    wash: "#fff7ed",
    series: "saves" as const,
    change: "saves" as const,
    note: "vs the period before",
  },
];

const QUICK: { text: string; icon: IconName; href: string; tint: string; wash: string }[] = [
  { text: "Add a person", icon: "plus", href: "/admin/contacts/new", tint: "#2563eb", wash: "#eff6ff" },
  { text: "Add a company", icon: "building", href: "/admin/companies", tint: "#10b981", wash: "#ecfdf5" },
  { text: "Edit pictures", icon: "grid", href: "/admin/companies", tint: "#7c3aed", wash: "#f5f3ff" },
  { text: "Card templates", icon: "qr", href: "/admin/templates", tint: "#f97316", wash: "#fff7ed" },
  { text: "Administrators", icon: "user", href: "/admin/administrators", tint: "#db2777", wash: "#fdf2f8" },
  { text: "Analytics", icon: "chart", href: "/admin/analytics", tint: "#0891b2", wash: "#ecfeff" },
];

function pretty(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Me>("/api/admin/me").then(setMe).catch(() => {});
    apiJson<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setStats(null);
    apiJson<Analytics>(`/api/admin/analytics?days=${days}`)
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [days]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
        {error}
      </p>
    );
  }
  if (!data || !stats) return <p className="text-ink-soft">Loading…</p>;

  const first = (me?.name || me?.email || "").split(/[\s—]+/)[0];
  const totals: Record<string, number> = {
    contacts: data.totals.contacts,
    active: stats.totals.active_cards,
    views: stats.totals.views,
    saves: stats.totals.saves,
  };
  const busiest = stats.top.slice(0, 4);
  const mostViews = Math.max(1, ...busiest.map((c) => c.views));

  return (
    <>
      {/* --- Who, when, and the one thing you came to do ------------------ */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] font-bold leading-tight">
            Welcome back{first ? `, ${first}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            What the True Star contact cards have been doing {days === 1 ? "today" : `over ${days} days`}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="btn cursor-default gap-2 bg-paper">
            <Icon name="calendar" className="size-4 text-ink-soft" />
            {pretty(stats.from)} – {pretty(stats.to)}
          </span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Period"
            className="field w-auto bg-paper text-sm"
          >
            {[7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
          <Link href="/admin/contacts/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            Create a card
          </Link>
        </div>
      </header>

      {/* --- The four figures -------------------------------------------- */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((tile) => {
          const change = stats.change[tile.change];
          const points = stats.series.map((d) => d[tile.series]);
          return (
            <div
              key={tile.key}
              className="surface overflow-hidden p-4"
              style={{ background: tile.wash }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "#ffffff", color: tile.tint }}
                >
                  <Icon name={tile.icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-soft">{tile.label}</p>
                  <p className="font-display text-[1.75rem] font-bold leading-tight">
                    {totals[tile.key].toLocaleString()}
                    {tile.key === "active" ? (
                      <span className="text-base font-semibold text-ink-soft">
                        {" "}
                        / {stats.totals.cards}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="flex items-center gap-1 text-xs font-semibold">
                  {change !== null ? (
                    <>
                      <span style={{ color: change >= 0 ? "#10b981" : "#c2410c" }}>
                        <Icon
                          name={change >= 0 ? "trend-up" : "trend-down"}
                          className="size-3.5"
                        />
                      </span>
                      <span style={{ color: change >= 0 ? "#10b981" : "#c2410c" }}>
                        {change >= 0 ? "+" : ""}
                        {change}%
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-soft">
                      {tile.key === "contacts" ? `${stats.totals.new_cards} new` : "no earlier data"}
                    </span>
                  )}
                  <span className="font-normal text-ink-soft">{tile.note}</span>
                </p>
                <Spark points={points} tint={tile.tint} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* --- Views against saves ---------------------------------------- */}
        <section className="surface p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Card views</h2>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: "#2563eb" }} />
                Views
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: "#93c5fd" }} />
                Saves
              </span>
            </div>
          </div>
          <Bars series={stats.series} />
        </section>

        {/* --- The cards doing the work ----------------------------------- */}
        <section className="surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Top performing cards</h2>
            <Link href="/admin/analytics" className="text-sm font-semibold text-brand-ink hover:underline">
              View all
            </Link>
          </div>
          {busiest.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing opened yet in this period.</p>
          ) : (
            <ul className="space-y-3">
              {busiest.map((card, i) => (
                <li key={card.id} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-wash font-mono text-[11px] text-ink-soft">
                    {i + 1}
                  </span>
                  {card.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                    <img
                      src={card.photo_url}
                      alt=""
                      className="size-10 shrink-0 rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-[11px] text-ink-soft">
                      {(card.first_name?.[0] ?? "") + (card.last_name?.[0] ?? "")}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/admin/contacts/${card.id}`}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {[card.first_name, card.last_name].filter(Boolean).join(" ")}
                    </Link>
                    <span className="block truncate text-xs text-ink-soft">
                      {card.job_title || card.company}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 block h-1.5 w-full rounded-full bg-wash"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(card.views / mostViews) * 100}%`,
                          background: "#2563eb",
                        }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="block font-semibold">{card.views} views</span>
                    <span className="block text-ink-soft">{card.saves} saved</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* --- Who was added lately --------------------------------------- */}
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line p-5">
            <h2 className="font-display text-lg font-bold">Recently added or changed</h2>
            <Link href="/admin/people" className="text-sm font-semibold text-brand-ink hover:underline">
              View all
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <p className="p-5 text-sm text-ink-soft">Nothing yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                  <th className="p-3 font-semibold">Name</th>
                  <th className="p-3 font-semibold">Email</th>
                  <th className="p-3 font-semibold">Company</th>
                  <th className="p-3 font-semibold">Changed</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.slice(0, 5).map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <span className="flex items-center gap-2.5">
                        {row.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                          <img
                            src={row.photo_url}
                            alt=""
                            className="size-8 shrink-0 rounded-full border border-line object-cover"
                          />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-ink-soft">
                            {(row.first_name?.[0] ?? "") + (row.last_name?.[0] ?? "")}
                          </span>
                        )}
                        <Link
                          href={`/admin/contacts/${row.id}`}
                          className="truncate font-semibold hover:underline"
                        >
                          {[row.first_name, row.last_name].filter(Boolean).join(" ")}
                        </Link>
                      </span>
                    </td>
                    <td className="truncate p-3 text-ink-soft">{row.email ?? "—"}</td>
                    <td className="truncate p-3">
                      <Link
                        href={`/admin/companies/${row.company_id}`}
                        className="hover:underline"
                      >
                        {companyLabel({ name: row.company, branch: row.branch })}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap p-3 text-ink-soft">
                      {new Date(row.updated_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* --- The six things done most often ----------------------------- */}
        <section className="surface p-5">
          <h2 className="mb-4 font-display text-lg font-bold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {QUICK.map((action) => (
              <Link
                key={action.text}
                href={action.href}
                className="flex flex-col items-center gap-2 rounded-xl p-4 text-center text-xs font-semibold transition-transform hover:-translate-y-0.5"
                style={{ background: action.wash }}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-full text-white"
                  style={{ background: action.tint }}
                >
                  <Icon name={action.icon} className="size-4.5" />
                </span>
                {action.text}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** A tile's own line: shape only, no axis — the number beside it is the fact. */
function Spark({ points, tint }: { points: number[]; tint: string }) {
  if (points.length < 2) return null;
  const peak = Math.max(1, ...points);
  const w = 88;
  const h = 32;
  const step = w / (points.length - 1);
  const line = points
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(h - (v / peak) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-22 shrink-0" aria-hidden="true">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={tint} opacity={0.12} />
      <path d={line} fill="none" stroke={tint} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

/** Views against saves, one pair of bars per day.
 *
 *  Bars rather than lines because each day is a count in its own right, and
 *  the two series share one axis so they can be compared directly. */
function Bars({ series }: { series: Analytics["series"] }) {
  const W = 640;
  const H = 240;
  const pad = { top: 10, right: 8, bottom: 26, left: 34 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const peak = Math.max(1, ...series.flatMap((d) => [d.views, d.saves]));
  const step = Math.max(1, Math.ceil(peak / 4));
  const ceiling = step * 4;
  const slot = plotW / Math.max(1, series.length);
  const barW = Math.max(3, Math.min(12, slot / 2.6));
  const y = (v: number) => pad.top + plotH - (v / ceiling) * plotH;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Views and saves per day">
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(step * n)}
              y2={y(step * n)}
              stroke="var(--color-line)"
              strokeWidth={1}
            />
            <text x={pad.left - 6} y={y(step * n) + 4} textAnchor="end" className="fill-ink-soft text-[10px]">
              {step * n}
            </text>
          </g>
        ))}

        {series.map((d, i) => {
          const centre = pad.left + slot * i + slot / 2;
          return (
            <g key={d.day}>
              <rect
                x={centre - barW - 1}
                y={y(d.views)}
                width={barW}
                height={Math.max(0, y(0) - y(d.views))}
                rx={2}
                fill="#2563eb"
              >
                <title>{`${d.day}: ${d.views} views`}</title>
              </rect>
              <rect
                x={centre + 1}
                y={y(d.saves)}
                width={barW}
                height={Math.max(0, y(0) - y(d.saves))}
                rx={2}
                fill="#93c5fd"
              >
                <title>{`${d.day}: ${d.saves} saved`}</title>
              </rect>
              {series.length <= 16 || i % 3 === 0 ? (
                <text x={centre} y={H - 8} textAnchor="middle" className="fill-ink-soft text-[9px]">
                  {d.day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
