"use client";

import { useState } from "react";

import { track } from "../lib/track";
import { Icon } from "./icons";

/** The card's own top bar: share it, or keep it as a PDF.
 *
 *  Sharing hands the phone its own share sheet with the link as text, so
 *  whatever the sender picks — a message, a chat, mail — receives something
 *  readable they can tap. The link goes in `text` rather than `url` because a
 *  target that takes one often ignores the other, and the link is the point.
 *  No file rides along: attaching the QR made WhatsApp and the like post the
 *  picture and drop the link entirely.
 *
 *  Nothing is awaited before navigator.share. The sheet only opens while the
 *  tap that asked for it still counts as active, and on iOS a round trip
 *  inside the handler spends that.
 *
 *  Copying is the last resort, for a browser with no share sheet at all. The
 *  PDF is the browser's own print dialogue — every phone and desktop can
 *  already write one, and the print rules in globals.css make it read like a
 *  card rather than a web page. */
export default function CardShare({
  publicId,
  shareUrl,
  shareLabel,
  copiedLabel,
  pdfLabel,
  shareMessage,
}: {
  publicId: string;
  shareUrl: string;
  shareLabel: string;
  copiedLabel: string;
  pdfLabel: string;
  shareMessage?: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);

  async function copy(url: string) {
    try {
      await navigator.clipboard?.writeText(url);
      setNote(copiedLabel);
    } catch {
      setNote(url);
    }
  }

  function share() {
    track(publicId, "share");
    const url = new URL(shareUrl, window.location.href).toString();
    const text = shareMessage ? `${shareMessage}\n${url}` : url;

    if (navigator.share) {
      navigator.share({ title: document.title, text }).catch((cause: unknown) => {
        // A cancelled sheet is a decision, not a failure — only fall back to
        // the clipboard when the platform refused the share outright.
        if ((cause as Error)?.name !== "AbortError") void copy(url);
      });
      return;
    }
    void copy(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-label={shareLabel}
        title={shareLabel}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm"
      >
        <Icon name="share" className="size-3.5" />
        {shareLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          track(publicId, "pdf");
          window.print();
        }}
        aria-label={pdfLabel}
        title={pdfLabel}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm"
      >
        <Icon name="download" className="size-3.5" />
        PDF
      </button>
      {note ? (
        <p aria-live="polite" className="text-xs font-semibold text-white/90">
          {note}
        </p>
      ) : null}
    </div>
  );
}
