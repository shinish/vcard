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
  updated_at: string | null;
  branch?: string | null;
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
      [r.first_name, r.last_name, r.job_title, r.org, r.company, r.branch]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, term]);

  return (
    <div className="people-directory">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">People</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {rows === null
              ? "Loading…"
              : `${shown.length} ${shown.length === 1 ? "person" : "people"} with a card.`}
          </p>
        </div>
        <div className="directory-toolbar flex flex-wrap items-center gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name, role or company"
            aria-label="Filter people"
            className="field w-auto text-sm"
          />
          <select
            value={companyId}
            onChange={(e) => { setRows(null); setCompanyId(e.target.value); }}
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
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="surface max-w-xl p-8">
          <h2 className="font-display text-lg font-bold">{term || companyId ? "No matching people" : "Create your first contact card"}</h2>
          <p className="mt-2 text-sm text-ink-soft">
            {term || companyId
              ? "Nothing matches that filter."
              : "Add the first person and you will get a link to share."}
          </p>
        </div>
      ) : (
        <section className="surface overflow-hidden" aria-label="People directory">
          <div className="people-columns" aria-hidden="true"><span>Person</span><span>Company / branch</span><span>Updated</span><span>Actions</span></div>
          <ul className="people-list">
            {shown.map((row) => {
              const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
              const date = row.updated_at ? new Date(row.updated_at) : null;
              return (
                <li key={row.id}>
                  <article className="people-row directory-row">
                    <Link href={`/admin/contacts/${row.id}`} className="people-identity">
                      {row.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                        <img src={row.photo_url} alt="" className="people-avatar" />
                      ) : <span className="people-avatar">{(row.first_name?.[0] ?? "") + (row.last_name?.[0] ?? "")}</span>}
                      <span className="min-w-0"><strong className="block truncate">{name}</strong><span className="people-secondary">{row.job_title || "No job title"}</span></span>
                    </Link>
                    <span className="min-w-0"><span className="block truncate">{row.company}</span><span className="people-secondary">{row.branch || row.org || "—"}</span></span>
                    <span className="people-updated">{date && !Number.isNaN(date.getTime()) ? <time dateTime={row.updated_at!}>{date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</time> : "Not updated"}</span>
                    <div className="people-actions">
                      <button type="button" onClick={() => setShowing(showing === row.id ? null : row.id)} className="people-action" title="Share link" aria-label={`Share link for ${name}`} aria-expanded={showing === row.id} aria-controls={`person-link-${row.id}`}><Icon name="link" className="size-4" /></button>
                      <Link href={`/admin/contacts/${row.id}`} className="people-action" title="Open contact" aria-label={`Open ${name}`}><Icon name="eye" className="size-4" /></Link>
                      <Link href={`/admin/contacts/${row.id}/edit`} className="people-action people-edit" aria-label={`Edit ${name}`}>Edit</Link>
                    </div>
                    {showing === row.id ? <div id={`person-link-${row.id}`} className="people-share"><CopyLink label={`Share link for ${name}`} value={row.url} /></div> : null}
                  </article>
                </li>
              );
            })}
          </ul>
          <p className="people-footer" role="status" aria-live="polite">Showing {shown.length} of {rows.length} {rows.length === 1 ? "person" : "people"}</p>
        </section>
      )}
    </div>
  );
}
