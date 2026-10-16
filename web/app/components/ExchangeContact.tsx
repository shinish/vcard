"use client";

import { useState } from "react";

import { Icon } from "./icons";

/** Hands the card's own details back the other way: the visitor types theirs
 *  and the API emails them to whoever the card belongs to.
 *
 *  Folded shut until it is asked for, so the card still opens on contact
 *  details rather than a form. */
export default function ExchangeContact({
  publicId,
  title,
  intro,
  nameLabel,
  emailLabel,
  phoneLabel,
  messageLabel,
  sendLabel,
  sendingLabel,
  sentLabel,
  failedLabel,
}: {
  publicId: string;
  title: string;
  intro: string;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  messageLabel: string;
  sendLabel: string;
  sendingLabel: string;
  sentLabel: string;
  failedLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${publicId}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          message: form.get("message"),
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ?? failedLabel);
      }
      setDone(true);
    } catch (cause) {
      setError((cause as Error).message || failedLabel);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-line bg-wash p-4 text-center text-sm font-semibold">
        {sentLabel}
      </p>
    );
  }

  return (
    <section className="no-print">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="btn w-full justify-center py-3 font-display"
      >
        <Icon name="user" className="size-4 shrink-0" />
        {title}
      </button>

      {open ? (
        <form onSubmit={send} className="mt-3 space-y-3 rounded-xl border border-line bg-wash p-4">
          <p className="text-xs text-ink-soft">{intro}</p>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">{nameLabel}</span>
            <input name="name" required maxLength={80} autoComplete="name" className="field" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">{emailLabel}</span>
            <input
              name="email"
              type="email"
              required
              maxLength={120}
              autoComplete="email"
              className="field"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">{phoneLabel}</span>
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" className="field" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-soft">{messageLabel}</span>
            <textarea name="message" rows={3} maxLength={600} className="field" />
          </label>
          {error ? (
            <p role="alert" className="text-xs font-semibold text-brand-ink">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className="btn btn-dark w-full justify-center py-3">
            {busy ? sendingLabel : sendLabel}
          </button>
        </form>
      ) : null}
    </section>
  );
}
