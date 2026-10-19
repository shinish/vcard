"use client";

import { useEffect, useRef, useState } from "react";

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
  const qrFile = useRef<File | null>(null);

  // Fetched ahead of the tap rather than during it. navigator.share() only
  // runs while the gesture that triggered it still counts as active, and on
  // iOS awaiting a network round trip inside the handler spends that
  // activation: the call then throws and the phone's share sheet never opens.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch(qrUrl);
        if (!response.ok) return;
        const file = new File([await response.blob()], "card-qr.png", { type: "image/png" });
        if (live) qrFile.current = file;
      } catch {
        // No QR to hand over. Sharing the link by itself is still worth doing.
      }
    })();
    return () => {
      live = false;
    };
  }, [qrUrl]);

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
    const data: ShareData = { title: document.title, text: shareMessage ?? undefined, url };

    const file = qrFile.current;
    if (file && navigator.canShare?.({ files: [file] })) data.files = [file];

    if (navigator.share) {
      navigator.share(data).catch((cause: unknown) => {
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
