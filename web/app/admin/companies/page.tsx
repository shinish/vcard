"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type Company, api, apiJson } from "../../lib/api";

export default function ChooseCompanyPage() {
  const [rows, setRows] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

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
            Open one to manage its people. A company with several branches lists each
            separately, since every branch has its own address and phone.
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
                placeholder="True Star Business Solutions"
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

      {rows === null ? (
        <p className="text-ink-soft">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="surface max-w-xl p-8">
          <h2 className="font-display text-lg font-bold">No companies yet</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Add the first one, then you can start adding its people.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(
            rows.reduce((acc, row) => {
              acc.set(row.name, [...(acc.get(row.name) ?? []), row]);
              return acc;
            }, new Map<string, Company[]>()),
          ).map(([name, branches]) => (
            <section key={name}>
              {branches.length > 1 || branches[0].branch ? (
                <h2 className="mb-3 font-display text-sm font-semibold text-ink-soft">
                  {name}
                  <span className="ml-2 font-normal">
                    {branches.length} {branches.length === 1 ? "branch" : "branches"}
                  </span>
                </h2>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {branches.map((row) => (
                  <Link
                    key={row.id}
                    href={`/admin/companies/${row.id}`}
                    className="company-tile surface group block p-6 hover:border-brand"
                  >
                    <span className="grad-rule block h-1 w-8" />
                    <h3 className="mt-4 font-display text-lg font-bold group-hover:text-brand-ink">
                      {row.branch || row.name}
                    </h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      {[row.city, row.country].filter(Boolean).join(", ") || "No address set"}
                    </p>
                    <p className="mt-2 text-sm text-ink-soft">
                      {row.contact_count} {row.contact_count === 1 ? "person" : "people"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
