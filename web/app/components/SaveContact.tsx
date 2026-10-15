"use client";

import { useState } from "react";

/** The card's one job. A plain anchor, so it works before React hydrates. */
/** Strings are passed in already built: a server component cannot hand a
 *  function to a client component, so the wording is resolved before it gets
 *  here. */
export default function SaveContact({
  href,
  saveLabel,
  doneLabel,
}: {
  href: string;
  saveLabel: string;
  doneLabel: string;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3">
      <a
        href={href}
        download
        onClick={() => setSaved(true)}
        className="block bg-ink px-6 py-4 text-center font-display font-semibold text-white hover:bg-cyan-deep hover:text-ink"
      >
        {saveLabel}
      </a>
      <p aria-live="polite" className="min-h-5 text-center text-sm text-ink-soft">
        {saved ? (
          <span className="confirm">{doneLabel}</span>
        ) : null}
      </p>
    </div>
  );
}
