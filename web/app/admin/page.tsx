"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "../components/icons";
import { type Dashboard, apiJson, companyLabel } from "../lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Dashboard>("/api/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
        {error}
      </p>
    );
  }
  if (!data) return <p className="text-ink-soft">Loading…</p>;

  const busiest = Math.max(1, ...data.companies.map((c) => c.contact_count));

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-soft">How many people each company has on a card.</p>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Companies", value: data.totals.companies, icon: "building" as const },
          { label: "People with cards", value: data.totals.contacts, icon: "people" as const },
          { label: "Card opens", value: data.totals.views ?? 0, icon: "chart" as const },
          { label: "Saved to phones", value: data.totals.saves ?? 0, icon: "download" as const },
          { label: "Administrators", value: data.totals.admins, icon: "user" as const },
        ].map((t) => (
          <div key={t.label} className="surface p-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-wash text-brand-ink">
              <Icon name={t.icon} className="size-4" />
            </span>
            <p className="mt-3 font-display text-3xl font-bold">{t.value}</p>
            <p className="text-sm text-ink-soft">{t.label}</p>
          </div>
        ))}
      </div>

      <section className="surface mb-8 p-6">
        <h2 className="font-display text-lg font-bold">People per company</h2>
        {data.companies.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No companies yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.companies.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/companies/${c.id}`}
                  className="group flex items-center gap-4 hover:text-brand-ink"
                >
                  <span className="w-48 shrink-0 truncate text-sm font-semibold">
                    {companyLabel(c)}
                  </span>
                  <span className="flex h-3 min-w-0 flex-1 bg-wash">
                    <span
                      className="grad-brand block h-3"
                      style={{ width: `${Math.round((c.contact_count / busiest) * 100)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm text-ink-soft">
                    {c.contact_count} {c.contact_count === 1 ? "person" : "people"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.busiest?.length ? (
        <section className="surface mb-8 p-6">
          <h2 className="font-display text-lg font-bold">Most opened cards</h2>
          <ul className="mt-4 divide-y divide-line">
            {data.busiest.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {[b.first_name, b.last_name].filter(Boolean).join(" ")}
                </span>
                <span className="truncate text-sm text-ink-soft">
                  {companyLabel({ name: b.company, branch: b.branch })}
                </span>
                <span className="chip">{b.views} opens</span>
                <Link href={`/admin/contacts/${b.id}`} className="btn px-3 py-1 text-xs">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface p-6">
        <h2 className="font-display text-lg font-bold">Recently added or changed</h2>
        {data.recent.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {[r.first_name, r.last_name].filter(Boolean).join(" ")}
                </span>
                <span className="truncate text-sm text-ink-soft">
                  {companyLabel({ name: r.company, branch: r.branch })}
                </span>
                <Link href={`/admin/contacts/${r.id}`} className="btn px-3 py-1 text-xs">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
