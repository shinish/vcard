"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { useEffect, useState } from "react";

import { type Company, api, apiJson } from "../../lib/api";

export default function ChooseCompanyPage() {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [sharing, setSharing] = useState("all");
  const needle = search.trim().toLocaleLowerCase();
  const shown = (rows ?? []).filter((row) =>
    (sharing === "all" || Boolean(row.public_sharing) === (sharing === "shared")) &&
    [row.name, row.branch, row.city, row.country, row.street, row.email, row.phone, row.website]
      .some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
  const companyCount = new Set((rows ?? []).map((row) => row.name)).size;
  const peopleCount = (rows ?? []).reduce((count, row) => count + row.contact_count, 0);

  function load() {
    apiJson<Company[]>("/api/admin/companies")
      .then(setRows)
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function addCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const res = await api("/api/admin/companies", { method: "POST", body: new FormData(form) });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not add the company (${res.status}).`);
      }
      form.reset();
      setAdding(false);
      load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Companies</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Manage your companies, branches and contact cards in one place.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn btn-primary"
        >
          {adding ? "Cancel" : "Add company"}
        </button>
      </header>

      {adding ? (
        <form onSubmit={addCompany} className="surface mb-7 max-w-xl p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Company name</span>
              <input
                name="name"
                required
                autoFocus
                placeholder="TrueTap"
                className="field"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Branch (optional)</span>
              <input
                name="branch"
                placeholder="Muscat"
                className="field"
              />
              <span className="block text-xs text-ink-soft">
                Use the same company name for each branch; only this differs.
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-5 btn btn-primary"
          >
            {busy ? "Adding…" : "Add company"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <section className="company-directory surface" aria-label="Company directory">
        <div className="company-directory-toolbar">
          <div className="company-directory-summary">
            <strong>{rows === null ? "Loading companies…" : `${companyCount} ${companyCount === 1 ? "company" : "companies"}`}</strong>
            {rows ? <span>{rows.length} {rows.length === 1 ? "branch" : "branches"} <span aria-hidden="true">·</span> <span aria-hidden="true">👥</span> {peopleCount} {peopleCount === 1 ? "person" : "people"}</span> : null}
          </div>
          <div className="company-directory-filters">
            <label className="company-directory-search">
              <Icon name="search" className="size-4" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search companies, locations or contacts…" aria-label="Search companies" className="field" />
            </label>
            <select className="field" value={sharing} onChange={(event) => setSharing(event.target.value)} aria-label="Filter by sharing">
              <option value="all">All sharing states</option>
              <option value="shared">Public sharing on</option>
              <option value="private">Public sharing off</option>
            </select>
          </div>
        </div>

        <div className="company-directory-columns" aria-hidden="true">
          <span>Company / branch</span><span>Location</span><span>Contact details</span><span>People</span><span>Sharing</span>
        </div>

        {rows === null ? <p role="status" className="p-6 text-sm text-ink-soft">Loading your directory…</p> : rows.length === 0 ? (
          <div className="p-8">
            <h2 className="font-display text-lg font-bold">No companies yet</h2>
            <p className="mt-2 text-sm text-ink-soft">Add your first company, then create contact cards for its people.</p>
            <button type="button" onClick={() => setAdding(true)} className="btn mt-4">Add company</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="p-8">
            <h2 className="font-display text-lg font-bold">No matching companies</h2>
            <p className="mt-2 text-sm text-ink-soft">Try another name, branch, location, email or phone number.</p>
            <button type="button" onClick={() => { setSearch(""); setSharing("all"); }} className="btn mt-4">Clear filters</button>
          </div>
        ) : (
          <ul className="company-directory-list">
            {shown.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/companies/${row.id}`} className="company-directory-row">
                  <span className="company-directory-identity">
                    <span className="company-directory-logo">
                      {row.logo_path ? <Image src={`/api/admin/companies/${row.id}/logo.png?v=${encodeURIComponent(row.logo_path)}`} alt="" width={36} height={36} className="max-h-full object-contain" /> : <Icon name="building" className="size-5" />}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate">{row.name}</strong>
                      <span className="company-directory-secondary">{row.branch || "No branch label"}</span>
                    </span>
                  </span>
                  <span className="company-directory-location">
                    <span className="block truncate">{[row.city, row.country].filter(Boolean).join(", ") || "Location not set"}</span>
                    <span className="company-directory-secondary">{row.street || "No street address"}</span>
                  </span>
                  <span className="company-directory-contact">
                    <span className="block truncate">{row.email || row.website || "Email not set"}</span>
                    <span className="company-directory-secondary">{row.phone || "Phone not set"}</span>
                  </span>
                  <span className="company-directory-people"><span aria-hidden="true">👥</span> <strong>{row.contact_count}</strong><span className="company-directory-mobile-label">{row.contact_count === 1 ? "person" : "people"}</span></span>
                  <span className="company-directory-state">
                    <span className={row.public_sharing ? "badge-live" : "badge-off"}>{row.public_sharing ? "On" : "Off"}<span className="sr-only"> — public sharing</span></span>
                    <Icon name="arrow-right" className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows && rows.length > 0 ? <p role="status" aria-live="polite" className="company-directory-footer">Showing {shown.length} of {rows.length} {rows.length === 1 ? "branch" : "branches"}</p> : null}
      </section>
    </>
  );
}
