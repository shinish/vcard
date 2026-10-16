"use client";

import { useState } from "react";

import { track } from "../lib/track";
import { Icon } from "./icons";

/** The card's own top bar: share it, or keep it as a PDF.
 *
 *  Sharing hands over the QR code as a picture where the browser allows a
 *  file, so WhatsApp and the like get something to post rather than a bare
 *  link; everywhere else it falls back to the link, then to the clipboard.
 *  The PDF is the browser's own print dialogue — every phone and desktop can
 *  already write one, and the print rules in globals.css make it read like a
 *  card rather than a web page. */
export default function CardShare({
  publicId,
  shareUrl,
  qrUrl,
  shareLabel,
  copiedLabel,
  pdfLabel,
  shareMessage,
}: {
  publicId: string;
  shareUrl: string;
  qrUrl: string;
  shareLabel: string;
  copiedLabel: string;
  pdfLabel: string;
  shareMessage?: string | null;
}) {
  const [note, setNote] = useState<string | null>(null);

  async function qrFile(): Promise<File | null> {
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) return null;
      return new File([await response.blob()], "card-qr.png", { type: "image/png" });
    } catch {
      return null;
    }
  }

  async function share() {
    track(publicId, "share");
    const url = new URL(shareUrl, window.location.href).toString();
    const data: ShareData = { title: document.title, text: shareMessage ?? undefined, url };

    const file = await qrFile();
    if (file && navigator.canShare?.({ files: [file] })) data.files = [file];

    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // cancelled, or not permitted: fall through to copying
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      setNote(copiedLabel);
    } catch {
      setNote(url);
    }
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
