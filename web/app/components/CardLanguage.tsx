"use client";

import { useRouter } from "next/navigation";

import { LANGUAGES, type Language } from "../lib/i18n";

/** Lets whoever opens the card read it in their own language.
 *
 *  The choice is a query parameter, so the page stays server-rendered and the
 *  link can be shared already switched. The company's own setting is the
 *  default when there is no parameter. */
export default function CardLanguage({
  current,
  label,
}: {
  current: Language;
  label: string;
}) {
  const router = useRouter();

  return (
    <label className="inline-flex items-center gap-1 text-xs font-semibold">
      <span className="sr-only">{label}</span>
      <select
        value={current}
        onChange={(e) => router.replace(`?lang=${e.target.value}`, { scroll: false })}
        aria-label={label}
        className="rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm [&>option]:text-ink"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
