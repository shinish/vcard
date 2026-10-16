"use client";

import { useState } from "react";

import { Icon, type IconName } from "./icons";

export type Action = { kind: string; href: string; label: string; icon: IconName };

/** Reports what someone did with a card. Fire-and-forget: the navigation
 *  must not wait for it, and a blocked request must not break the link. */
function track(publicId: string, kind: string) {
  try {
    const body = JSON.stringify({ kind });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `/api/public/${publicId}/event`,
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch(`/api/public/${publicId}/event`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  } catch {
    // analytics are never worth an error in front of a visitor
  }
}

export default function CardActions({
  publicId,
  vcfUrl,
  shareUrl,
  actions,
  saveLabel,
  doneLabel,
  shareLabel,
  copiedLabel,
  allowSave = true,
  requireConsent = false,
  consentLabel,
  shareMessage,
}: {
  publicId: string;
  vcfUrl: string;
  shareUrl: string;
  actions: Action[];
  saveLabel: string;
  doneLabel: string;
  shareLabel: string;
  copiedLabel: string;
  allowSave?: boolean;
  requireConsent?: boolean;
  consentLabel?: string;
  shareMessage?: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  async function share() {
    track(publicId, "share");
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          text: shareMessage ?? undefined,
          url: shareUrl,
        });
        return;
      } catch {
        // cancelled, or not permitted: fall through to copying
      }
    }
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setNote(copiedLabel);
    } catch {
      setNote(shareUrl);
    }
  }

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

      <div className="flex flex-wrap gap-2">
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
            className={`save-contact-action btn btn-dark flex-1 py-3.5 font-display ${
              requireConsent && !agreed ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Icon name="download" className="size-4 shrink-0" />
            {saveLabel}
          </a>
        ) : null}
        <button
          type="button"
          onClick={share}
          aria-label={shareLabel}
          className={`btn shrink-0 px-3 py-3.5 ${allowSave ? "" : "flex-1 font-display"}`}
        >
          <Icon name="share" className="size-4" />
          {allowSave ? null : shareLabel}
        </button>
      </div>

      {actions.length ? (
        <div className="grid grid-cols-4 gap-2">
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
