"use client";

import { useState } from "react";

import { joinPhone } from "../lib/phone";
import { DIAL_CODES, flagOf, splitDial } from "../lib/countries";

/** A dial code beside a number, posting one value under `name`.
 *
 *  The two controls are for the person typing; the form only ever sees the
 *  joined string, so nothing downstream has to learn about country codes.
 */
export default function PhoneField({
  name,
  label,
  defaultValue = "",
  fallbackDial = "+968",
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  fallbackDial?: string;
}) {
  const start = splitDial(defaultValue ?? "");
  const [dial, setDial] = useState(start.dial || (defaultValue ? "" : fallbackDial));
  const [rest, setRest] = useState(start.rest);

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink-soft">{label}</span>
      <input type="hidden" name={name} value={joinPhone(dial, rest)} />
      <span className="flex gap-2">
        <select
          value={dial}
          onChange={(e) => setDial(e.target.value)}
          aria-label={`${label} country code`}
          className="field w-auto shrink-0 bg-paper"
        >
          <option value="">+ …</option>
          {DIAL_CODES.map((entry) => (
            <option key={`${entry.code}${entry.dial}`} value={entry.dial}>
              {flagOf(entry.code)} {entry.dial}
            </option>
          ))}
        </select>
        <input
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="2456 7890"
          aria-label={label}
          className="field min-w-0 flex-1"
        />
      </span>
    </label>
  );
}
