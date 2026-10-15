"use client";

import { useEffect, useRef, useState } from "react";

import { ADDRESS_PARTS, type AddressValue, apiJson } from "../lib/api";
import { COUNTRIES } from "../lib/countries";

type Suggestion = {
  label: string;
  street: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

const input =
  "field text-sm";

/** Address entry with OpenStreetMap lookup.
 *
 *  The search is a convenience, never a gate: if the geocoder is slow, down,
 *  or simply does not know the place, the component fields below stay
 *  editable and nothing is blocked.
 */
export default function AddressInput({
  value,
  onChange,
  countryHint,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  /** The company's country, so a search for a local street does not return
   *  one with the same name on the other side of the Gulf. */
  countryHint?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Debounced: one lookup after typing settles, not one per keystroke.
    const timer = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const country = countryHint ? `&country=${encodeURIComponent(countryHint)}` : "";
        const data = await apiJson<{ results: Suggestion[] }>(
          `/api/admin/geocode?q=${encodeURIComponent(text)}${country}`,
        );
        if (ticket === latest.current) setResults(data.results);
      } catch {
        if (ticket === latest.current) setResults([]);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, countryHint]);

  function apply(s: Suggestion) {
    onChange({
      street: s.street,
      city: s.city,
      region: s.region,
      postal: s.postal,
      country: s.country,
    });
    setQuery("");
    setResults(null);
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-ink-soft">
          Find an address (OpenStreetMap)
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a street, building or area"
          className={input}
        />
      </label>

      {searching ? <p className="text-xs text-ink-soft">Searching…</p> : null}

      {results !== null && !searching ? (
        results.length ? (
          <ul className="surface divide-y divide-line overflow-hidden">
            {results.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => apply(s)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-wash"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-soft">
            Nothing found. Fill the fields in below instead.
          </p>
        )
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {ADDRESS_PARTS.filter((p) => p !== "country").map((part) => (
          <input
            key={part}
            aria-label={part}
            placeholder={part}
            value={value[part] ?? ""}
            onChange={(e) => onChange({ ...value, [part]: e.target.value })}
            className={`${input} ${part === "street" ? "sm:col-span-2" : ""}`}
          />
        ))}
        <select
          aria-label="country"
          value={value.country ?? ""}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
          className={`${input} bg-paper`}
        >
          <option value="">Country</option>
          {/* keep an unlisted value from a previous save rather than dropping it */}
          {value.country && !COUNTRIES.includes(value.country) ? (
            <option value={value.country}>{value.country}</option>
          ) : null}
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
