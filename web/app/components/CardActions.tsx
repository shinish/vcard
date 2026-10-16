"use client";

import { useState } from "react";

import { track } from "../lib/track";
import { Icon, type IconName } from "./icons";

export type Action = { kind: string; href: string; label: string; icon: IconName };

export default function CardActions({
  publicId,
  vcfUrl,
  actions,
  saveLabel,
  doneLabel,
  allowSave = true,
  requireConsent = false,
  consentLabel,
}: {
  publicId: string;
  vcfUrl: string;
  actions: Action[];
  saveLabel: string;
  doneLabel: string;
  allowSave?: boolean;
  requireConsent?: boolean;
  consentLabel?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="space-y-3">
      {/* The company can ask the visitor to agree before the card hands over
          a contact file, and can switch saving off entirely. */}
      {allowSave && requireConsent ? (
        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-wash p-3 text-xs">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-brand"
          />
          <span>{consentLabel}</span>
        </label>
      ) : null}

      {allowSave ? (
        <a
          href={agreed || !requireConsent ? vcfUrl : undefined}
          download
          aria-disabled={requireConsent && !agreed}
          onClick={(event) => {
            if (requireConsent && !agreed) {
              event.preventDefault();
              return;
            }
            track(publicId, "save");
            setNote(doneLabel);
          }}
          className={`save-contact-action btn btn-dark no-print w-full justify-center py-3.5 font-display ${
            requireConsent && !agreed ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <Icon name="download" className="size-4 shrink-0" />
          {saveLabel}
        </a>
      ) : null}

      {/* The handful of things someone most often wants. One column each, so
          three of them sit centred across the card rather than leaving a
          fourth column's worth of gap on one side. */}
      {actions.length ? (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
        >
          {actions.map((a) => (
            <a
              key={a.kind}
              href={a.href}
              onClick={() => track(publicId, a.kind)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-wash py-3 text-[11px] font-semibold text-ink-soft hover:border-brand hover:text-ink"
            >
              <Icon name={a.icon} className="size-5 text-brand-ink" />
              {a.label}
            </a>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" className="min-h-5 text-center text-xs text-ink-soft">
        {note ? <span className="confirm break-words">{note}</span> : null}
      </p>
    </div>
  );
}
