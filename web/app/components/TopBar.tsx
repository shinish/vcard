"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Icon } from "./icons";
import { apiJson, companyLabel } from "../lib/api";

type Hits = {
  companies: { id: number; name: string; branch: string; contact_count: number }[];
  people: {
    id: number;
    public_id: string;
    first_name: string;
    last_name: string | null;
    job_title: string | null;
    company: string;
    branch: string;
  }[];
};

/** The bar over every admin page: one search box. The account sits at the
 *  foot of the sidebar, where a signed-in name belongs.
 *
 *  Search asks the API on a short delay rather than on every keystroke, and
 *  only from two characters — a one-letter search matches everything.
 */
export default function TopBar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hits | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ctrl/Cmd+K is where everyone's fingers already go.
    function key(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        box.current?.focus();
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (term.trim().length < 2) {
      return;
    }
    const timer = setTimeout(() => {
      apiJson<Hits>(`/api/admin/search?q=${encodeURIComponent(term.trim())}`)
        .then((found) => {
          setHits(found);
          setOpen(true);
        })
        .catch(() => setHits(null));
    }, 180);
    return () => clearTimeout(timer);
  }, [term]);

  const nothing = hits && hits.companies.length === 0 && hits.people.length === 0;

  return (
    <header className="workspace-topbar sticky top-0 z-20 flex items-center gap-4 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur sm:px-9">
      <div className="relative min-w-0 flex-1 sm:max-w-xl">
        <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">
          <Icon name="search" className="size-4" />
        </span>
        <input
          ref={box}
          value={term}
          onChange={(e) => { setTerm(e.target.value); if (e.target.value.trim().length < 2) setHits(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search companies, people or card ids…"
          aria-label="Search"
          className="field rounded-xl bg-wash pl-9 pr-16 text-sm"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft sm:block">
          ⌘K
        </kbd>

        {open && hits ? (
          <div className="surface absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-auto p-2">
            {nothing ? <p className="px-3 py-2 text-sm text-ink-soft">Nothing matched.</p> : null}

            {hits.companies.length ? (
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-ink-soft">
                Companies
              </p>
            ) : null}
            {hits.companies.map((c) => (
              <Link
                key={c.id}
                href={`/admin/companies/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-wash"
              >
                <span className="truncate font-semibold">{companyLabel(c)}</span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {c.contact_count} {c.contact_count === 1 ? "person" : "people"}
                </span>
              </Link>
            ))}

            {hits.people.length ? (
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-ink-soft">People</p>
            ) : null}
            {hits.people.map((p) => (
              <Link
                key={p.id}
                href={`/admin/contacts/${p.id}`}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-wash"
              >
                <span className="block truncate font-semibold">
                  {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                </span>
                <span className="block truncate text-xs text-ink-soft">
                  {[p.job_title, p.branch ? `${p.company} — ${p.branch}` : p.company]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <Link href="/admin/profile" className="workspace-profile" aria-label={`Your profile: ${name}`}>
        <span className="workspace-avatar" aria-hidden="true">{photoUrl ? <Image src={photoUrl} alt="" width={42} height={42} className="size-full rounded-full object-cover" /> : name.slice(0, 2).toUpperCase()}</span>
        <span className="hidden min-w-0 sm:block"><strong className="block truncate">{name}</strong><span className="block text-xs text-ink-soft">Administrator</span></span>
        <Icon name="arrow-right" className="hidden size-3.5 rotate-90 text-ink-soft sm:block" />
      </Link>
    </header>
  );
}
