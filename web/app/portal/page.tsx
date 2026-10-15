"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CopyLink from "../components/CopyLink";
import TrendChart from "../components/TrendChart";
import { Icon } from "../components/icons";
import {
  ANALYTICS_DAYS,
  type Analytics,
  EVENT_LABELS,
  api,
  apiJson,
  fullName,
} from "../lib/api";

type Me = {
  id: number;
  public_id: string;
  url: string;
  login_email: string;
  photo_url: string | null;
  signature_template: string;
  signature_templates: { key: string; label: string }[];
  company: { name: string; branch: string } | null;
  stats: Record<string, number>;
} & Record<string, unknown>;

const COUNTERS = [
  { key: "views" as const, label: "Opens", icon: "chart" as const },
  { key: "clicks" as const, label: "Taps on it", icon: "link" as const },
  { key: "saves" as const, label: "Saved to a phone", icon: "download" as const },
  { key: "shares" as const, label: "Shares", icon: "share" as const },
];

const RANGE_LABELS: Record<number, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
  365: "12 months",
};

export default function PortalPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [template, setTemplate] = useState("classic");
  const [note, setNote] = useState<string | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson<Me>("/api/portal/me")
      .then((data) => {
        setMe(data);
        setTemplate(data.signature_template ?? "classic");
      })
      .catch(() => router.replace("/portal/login"));
  }, [router]);

  useEffect(() => {
    setStats(null);
    apiJson<Analytics>(`/api/portal/stats?days=${days}`)
      .then(setStats)
      .catch(() => setStats(null));
  }, [days]);

  if (!me) return <main className="p-10 text-ink-soft">Loading…</main>;

  const name = fullName(me as never);
  const sigUrl = `/api/public/${me.public_id}/signature.html?template=${template}`;

  async function save(body: Record<string, string>, said: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api("/api/portal/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `That did not work (${res.status}).`);
      }
      setNote(said);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api("/api/portal/logout", { method: "POST" });
    router.replace("/portal/login");
  }

  return (
    <main className="min-h-dvh bg-wash">
      <header className="grad-shell px-5 py-5 text-white sm:px-9">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold">{name}</h1>
            <p className="text-sm text-cyan">
              {me.company ? [me.company.name, me.company.branch].filter(Boolean).join(" — ") : ""}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60">{me.login_email}</span>
            <button onClick={signOut} className="btn bg-transparent text-white">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-9">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <section className="surface overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 font-display text-sm font-bold">
              Your card
            </h2>
            <iframe
              title="Your card"
              src={`/user/${me.public_id}`}
              className="h-[520px] w-full bg-wash"
            />
          </section>

          <div className="space-y-6">
            <section className="surface p-5">
              <h2 className="font-display text-sm font-bold">Share it</h2>
              <div className="mt-3">
                <CopyLink value={me.url} label="Your link" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`/user/${me.public_id}`} target="_blank" rel="noreferrer" className="btn">
                  <Icon name="link" className="size-4" />
                  Open it
                </a>
                <a href={`/api/public/${me.public_id}/qr.png`} download className="btn">
                  <Icon name="qr" className="size-4" />
                  QR code (PNG)
                </a>
                <a href={`/api/public/${me.public_id}.vcf`} download className="btn">
                  <Icon name="download" className="size-4" />
                  Contact file
                </a>
              </div>
            </section>

            <section className="surface p-5">
              <h2 className="font-display text-sm font-bold">Your email signature</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Pick a design, open it, select everything, copy, then paste it into Outlook or
                Gmail. The QR code and the link both open your card.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {me.signature_templates.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTemplate(t.key)}
                    className={`btn ${template === t.key ? "btn-primary" : ""}`}
                  >
                    {t.label.split(" — ")[0]}
                  </button>
                ))}
              </div>
              <iframe
                title="Signature preview"
                src={sigUrl}
                className="mt-4 h-60 w-full rounded-xl border border-line bg-paper"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={sigUrl} target="_blank" rel="noreferrer" className="btn">
                  Open it
                </a>
                <a href={sigUrl} download={`signature-${template}.html`} className="btn">
                  <Icon name="download" className="size-4" />
                  Download
                </a>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save({ signature_template: template }, "Saved as your default.")}
                  className="btn btn-primary"
                >
                  Keep this one
                </button>
              </div>
            </section>

            <section className="surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold">How your card is doing</h2>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  aria-label="Period"
                  className="field w-auto text-sm"
                >
                  {ANALYTICS_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {RANGE_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>

              {!stats ? (
                <p className="mt-3 text-sm text-ink-soft">Counting…</p>
              ) : (
                <>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {COUNTERS.map((c) => (
                      <li key={c.key} className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-wash text-brand-ink">
                          <Icon name={c.icon} className="size-4" />
                        </span>
                        <span>
                          <span className="font-display text-xl font-bold">
                            {stats.totals[c.key].toLocaleString()}
                          </span>
                          <span className="ml-2 text-sm text-ink-soft">{c.label}</span>
                          {stats.change[c.key] !== null ? (
                            <span className="block text-xs text-ink-soft">
                              {stats.change[c.key]! >= 0 ? "↑" : "↓"}{" "}
                              {Math.abs(stats.change[c.key]!)}% vs the {RANGE_LABELS[days]} before
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5">
                    <TrendChart series={stats.series} height={180} />
                  </div>

                  {stats.actions.length ? (
                    <div className="mt-5">
                      <h3 className="font-display text-sm font-bold">What people tapped</h3>
                      <ul className="mt-2 space-y-1.5">
                        {stats.actions.map((a) => (
                          <li key={a.kind} className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-semibold">{EVENT_LABELS[a.kind] ?? a.kind}</span>
                            <span className="font-mono text-xs">{a.n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {stats.sources.length ? (
                    <div className="mt-5">
                      <h3 className="font-display text-sm font-bold">Where the opens came from</h3>
                      <ul className="mt-2 space-y-1.5">
                        {stats.sources.map((src) => (
                          <li key={src.source} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 flex-1 truncate">{src.source}</span>
                            <span className="font-mono text-xs">{src.n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="mt-4 text-xs text-ink-soft">
                    Counted on your card itself. No addresses or locations are kept, so nobody —
                    including you — can see who opened it.
                  </p>
                </>
              )}
            </section>

            <section className="surface p-5">
              <h2 className="font-display text-sm font-bold">Change your password</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void save(
                    {
                      password: String(form.get("password") ?? ""),
                      new_password: String(form.get("new_password") ?? ""),
                    },
                    "Password changed. Other devices were signed out.",
                  );
                  e.currentTarget.reset();
                }}
                className="mt-3 grid gap-3 sm:grid-cols-2"
              >
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">Current password</span>
                  <input name="password" type="password" required className="field" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">New password</span>
                  <input
                    name="new_password"
                    type="password"
                    required
                    minLength={10}
                    className="field"
                  />
                </label>
                <button type="submit" disabled={busy} className="btn btn-primary sm:col-span-2 sm:w-fit">
                  Change it
                </button>
              </form>
            </section>

            <p aria-live="polite" className="min-h-5 text-sm">
              {error ? (
                <span role="alert" className="confirm block rounded-lg border-l-2 border-brand bg-paper px-3 py-2">
                  {error}
                </span>
              ) : note ? (
                <span className="confirm block text-ink-soft">{note}</span>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
