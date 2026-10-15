"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import CopyLink from "../../components/CopyLink";
import { Icon } from "../../components/icons";
import { type Company, apiJson, companyLabel } from "../../lib/api";

type Row = {
  id: number;
  public_id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  org: string | null;
  company: string;
  url: string;
  photo_url: string | null;
  updated_at: string;
};

/** Everyone with a card, across every company. */
export default function PeoplePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [term, setTerm] = useState("");
  const [showing, setShowing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Company[]>("/api/admin/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setRows(null);
    const scope = companyId ? `?company_id=${companyId}` : "";
    apiJson<Row[]>(`/api/admin/contacts${scope}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [companyId]);

  // Filtering a list this size is a browser's job, not a round trip.
  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle || !rows) return rows ?? [];
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.job_title, r.org, r.company]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, term]);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">People</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {rows === null
              ? "Loading…"
              : `${shown.length} ${shown.length === 1 ? "person" : "people"} with a card.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Filter by name or job title"
            aria-label="Filter people"
            className="field w-auto text-sm"
          />
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
          <Link href="/admin/contacts/new" className="btn btn-primary">
            <Icon name="plus" className="size-4" />
            Add a person
          </Link>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-cyan-deep bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="surface max-w-xl p-8">
          <h2 className="font-display text-lg font-bold">Nobody here</h2>
          <p className="mt-2 text-sm text-ink-soft">
            {term || companyId
              ? "Nothing matches that filter."
              : "Add the first person and you will get a link to share."}
          </p>
        </div>
      ) : (
        <div className="surface divide-y divide-line overflow-hidden">
          {shown.map((row) => (
            <article key={row.id} className="flex flex-wrap items-center gap-4 p-4">
              {row.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                <img
                  src={row.photo_url}
                  alt=""
                  className="size-11 shrink-0 rounded-full border border-line object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line font-display text-sm text-ink-soft">
                  {(row.first_name?.[0] ?? "") + (row.last_name?.[0] ?? "")}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold">
                  {[row.first_name, row.last_name].filter(Boolean).join(" ")}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {[row.job_title, row.company].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setShowing(showing === row.id ? null : row.id)}
                  className="btn"
                >
                  Link
                </button>
                <Link href={`/admin/contacts/${row.id}`} className="btn">
                  Open
                </Link>
                <Link href={`/admin/contacts/${row.id}/edit`} className="btn">
                  Edit
                </Link>
              </div>

              {showing === row.id ? (
                <div className="w-full border-t border-line pt-4">
                  <CopyLink label="Share link" value={row.url} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
