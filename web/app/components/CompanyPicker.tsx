"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { type Company, companyLabel } from "../lib/api";

/** Type-to-filter company chooser.
 *
 *  A combobox rather than a datalist because this field has to resolve to a
 *  company id: free text that quietly matches nothing would file a card under
 *  the wrong company, or none. The input only ever commits a real choice, and
 *  anything half-typed reverts on blur.
 */
export default function CompanyPicker({
  companies,
  value,
  onChange,
  id = "company-picker",
}: {
  companies: Company[];
  value: string;
  onChange: (companyId: string) => void;
  id?: string;
}) {
  const selected = companies.find((c) => String(c.id) === value) ?? null;
  const [query, setQuery] = useState(selected ? companyLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Follow the selection when it changes from outside (loading a contact).
  useEffect(() => {
    setQuery(selected ? companyLabel(selected) : "");
  }, [selected]);

  // Clicking away closes the list and abandons a half-typed query.
  useEffect(() => {
    function away(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selected ? companyLabel(selected) : "");
      }
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [selected]);

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    const typedSelection = selected && query === companyLabel(selected);
    if (!text || typedSelection) return companies;
    return companies.filter((c) => companyLabel(c).toLowerCase().includes(text));
  }, [companies, query, selected]);

  function commit(company: Company) {
    onChange(String(company.id));
    setQuery(companyLabel(company));
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => {
        const next = event.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(matches.length - 1, next));
      });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (matches[active]) commit(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected ? companyLabel(selected) : "");
    }
  }

  return (
    <div ref={box} className="relative">
      {/* the form posts the id, never the typed text */}
      <input type="hidden" name="company_id" value={value} />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder="Start typing a company or branch"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="field"
      />

      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto border border-line bg-paper shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-soft">No company matches that.</li>
          ) : (
            matches.map((company, i) => (
              <li key={company.id} role="option" aria-selected={String(company.id) === value}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(company)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    i === active ? "bg-wash" : ""
                  } ${String(company.id) === value ? "font-semibold" : ""}`}
                >
                  {companyLabel(company)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
