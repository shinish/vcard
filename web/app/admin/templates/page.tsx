"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type Company,
  FONTS,
  OFFERED_THEMES,
  THEMES,
  type ThemeKey,
  apiJson,
  companyLabel,
  paletteStyle,
} from "../../lib/api";

/** The background templates and type sets, and who is using each.
 *
 *  Read-only on purpose: a template belongs to a company, so it is chosen on
 *  that company's Card design tab. This page answers "what are my choices" and
 *  "who has what" in one place.
 */
export default function TemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Company[]>("/api/admin/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message));
  }, []);

  const users = (key: ThemeKey) => companies.filter((c) => (c.theme ?? "plain") === key);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Card templates</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every background a card can wear, with the companies using it. Pick one on a
          company&rsquo;s Card design tab; a new company starts on the default set in{" "}
          <Link href="/admin/settings" className="font-semibold text-brand-ink hover:underline">
            Settings
          </Link>
          .
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.filter(
          (theme) =>
            OFFERED_THEMES.some((o) => o.key === theme.key) ||
            companies.some((c) => (c.theme ?? "plain") === theme.key),
        ).map((theme) => {
          const taken = users(theme.key);
          return (
            <section key={theme.key} className="surface overflow-hidden">
              <span
                aria-hidden="true"
                className={`card-page tpl-${theme.key} flex h-40 items-center justify-center`}
                style={paletteStyle(taken[0]?.accents ?? null)}
              >
                <span className="surface w-32 p-3 text-center">
                  <span className="mx-auto block size-9 rounded-full bg-wash" />
                  <span className="mt-2 block h-1.5 w-20 rounded-full bg-ink/70" />
                  <span className="mt-1.5 block h-1 w-14 rounded-full bg-line" />
                </span>
              </span>

              <div className="p-4">
                <h2 className="font-display text-base font-bold">{theme.label}</h2>
                <p className="text-sm text-ink-soft">{theme.hint}</p>
                {taken.length ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {taken.map((c) => (
                      <li key={c.id}>
                        <Link href={`/admin/companies/${c.id}`} className="chip hover:text-ink">
                          {companyLabel(c)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-ink-soft">Nobody is using this one.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <h2 className="mb-4 mt-10 font-display text-lg font-bold">Type sets</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FONTS.map((font) => (
          <section key={font.key} className={`surface p-5 type-${font.key}`}>
            <p className="font-display text-xl font-bold">{font.label}</p>
            <p className="mt-1 text-sm">
              Sarah Johnson · Business Development Manager — and the body copy underneath reads
              like this.
            </p>
            <p className="mt-3 font-sans text-xs text-ink-soft">{font.hint}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {companies
                .filter((c) => (c.font ?? "poppins") === font.key)
                .map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/companies/${c.id}`} className="chip hover:text-ink">
                      {companyLabel(c)}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
