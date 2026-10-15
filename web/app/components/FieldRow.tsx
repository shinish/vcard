"use client";

import { useState } from "react";

import {
  ADDRESS_PARTS,
  type AddressValue,
  type ContactField,
  type Kind,
  LABELS,
} from "../lib/api";
import { DIAL_CODES, joinPhone, splitPhone } from "../lib/phone";
import AddressInput from "./AddressInput";

const CUSTOM = "__custom";

const PLACEHOLDER: Record<Kind, string> = {
  phone: "+968 9123 4567",
  email: "name@company.com",
  url: "company.com",
  address: "",
  date: "",
  social: "https://linkedin.com/in/…",
  im: "+968 9123 4567",
  relation: "Full name",
};

/** Country code and number are entered apart but stored merged, so the vCard
 *  and the card page see one ordinary phone number.
 *
 *  The chosen code is held in state while the number is still empty: merging
 *  it with nothing would yield an empty value, and re-deriving from that would
 *  silently throw the choice away. Picking the country first is the normal
 *  order, so that path has to work.
 */
function PhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = splitPhone(value);
  const [pendingDial, setPendingDial] = useState<string | null>(null);
  const hasNumber = Boolean((value ?? "").trim());
  const dial = hasNumber ? parsed.dial : (pendingDial ?? parsed.dial);
  const local = parsed.local;

  return (
    <div className="flex gap-2">
      <select
        aria-label="phone country code"
        value={dial}
        onChange={(e) => {
          setPendingDial(e.target.value);
          if (local) onChange(joinPhone(e.target.value, local));
        }}
        className="w-36 shrink-0 border border-line bg-paper px-2 py-2.5 text-sm focus:border-brand focus:outline-none"
      >
        {dial === "" ? <option value="">No code</option> : null}
        {DIAL_CODES.map((d) => (
          <option key={d.code + d.country} value={d.code}>
            {d.code} {d.country}
          </option>
        ))}
      </select>
      <input
        aria-label="phone value"
        type="tel"
        inputMode="tel"
        placeholder="9123 4567"
        value={local}
        onChange={(e) => onChange(joinPhone(dial, e.target.value))}
        className="field text-sm"
      />
    </div>
  );
}

export default function FieldRow({
  field,
  onChange,
  onRemove,
  countryHint,
}: {
  field: ContactField;
  onChange: (next: ContactField) => void;
  onRemove: () => void;
  countryHint?: string | null;
}) {
  const known = LABELS[field.kind];
  const isCustom = !known.includes(field.label);
  const input =
    "field text-sm";

  return (
    <div className="border border-line bg-wash p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {field.kind}
        </span>

        <select
          aria-label={`${field.kind} label`}
          value={isCustom ? CUSTOM : field.label}
          onChange={(e) =>
            onChange({ ...field, label: e.target.value === CUSTOM ? "" : e.target.value })
          }
          className="border border-line bg-paper px-2 py-1.5 text-sm"
        >
          {known.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          <option value={CUSTOM}>custom…</option>
        </select>

        {isCustom ? (
          <input
            aria-label={`${field.kind} custom label`}
            value={field.label}
            placeholder="Label"
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            className="w-32 border border-line px-2 py-1.5 text-sm"
          />
        ) : null}

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto px-2 py-1 text-sm font-semibold text-ink-soft underline hover:text-ink"
        >
          Remove
        </button>
      </div>

      <div className="mt-2.5">
        {field.kind === "phone" ? (
          <PhoneInput
            value={field.value as string}
            onChange={(next) => onChange({ ...field, value: next })}
          />
        ) : field.kind === "address" ? (
          <AddressInput
            value={field.value as AddressValue}
            onChange={(next) => onChange({ ...field, value: next })}
            countryHint={countryHint}
          />
        ) : (
          <input
            aria-label={`${field.kind} value`}
            type={field.kind === "date" ? "date" : "text"}
            placeholder={PLACEHOLDER[field.kind]}
            value={field.value as string}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
            className={input}
          />
        )}
      </div>
    </div>
  );
}
