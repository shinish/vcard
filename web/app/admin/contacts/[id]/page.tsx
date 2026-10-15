"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import CopyLink from "../../../components/CopyLink";
import { Icon } from "../../../components/icons";
import { LANGUAGES } from "../../../lib/i18n";
import { API, THEMES, api, apiJson, fullName } from "../../../lib/api";

type Loaded = {
  id: number;
  public_id: string;
  url: string;
  photo_url: string | null;
  company_id: number;
  login_email: string | null;
  portal_disabled: boolean;
  has_password: boolean;
  fields: { kind: string; label: string }[];
} & Record<string, unknown>;

type Stats = {
  by_kind: Record<string, number>;
  days: { day: string; n: number }[];
  sources: { source: string; n: number }[];
  last_seen: string | null;
};

const SIGNATURES = [
  { key: "classic", label: "Classic", hint: "Details beside a QR code" },
  { key: "banner", label: "Banner", hint: "Details with a picture panel" },
  { key: "panels", label: "Panels", hint: "Two tinted halves" },
  { key: "minimal", label: "Minimal", hint: "Photo, rule, plain rows" },
  { key: "compact", label: "Compact", hint: "One dark strip" },
];

const COUNTERS = [
  { kind: "view", label: "Opens", icon: "chart" as const },
  { kind: "save", label: "Saved to a phone", icon: "download" as const },
  { kind: "qr", label: "QR downloads", icon: "qr" as const },
  { kind: "share", label: "Shares", icon: "share" as const },
];

function when(iso: string | null): string {
  if (!iso) return "not yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contact, setContact] = useState<Loaded | null>(null);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState("classic");
  const [confirming, setConfirming] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [portalNote, setPortalNote] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    apiJson<Loaded>(`/api/admin/contacts/${id}`)
      .then((c) => {
        setContact(c);
        setLoginEmail(c.login_email ?? "");
        apiJson<Record<string, unknown>>(`/api/admin/companies/${c.company_id}`)
          .then(setCompany)
          .catch(() => {});
      })
      .catch((e) => setError(e.message));
    apiJson<Stats>(`/api/admin/contacts/${id}/stats`)
      .then(setStats)
      .catch(() => {});
  }, [id]);

  if (error) {
    return (
      <div className="surface max-w-xl p-6">
        <h1 className="font-display text-xl font-bold">Cannot open this contact</h1>
        <p className="mt-2 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  if (!contact) return <p className="text-ink-soft">Loading…</p>;

  const name = fullName(contact as never);
  const path = `/user/${contact.public_id}`;
  const sigUrl = `/api/public/${contact.public_id}/signature.html?template=${signature}`;
  const peak = Math.max(1, ...(stats?.days ?? []).map((d) => d.n));
  const shareText = encodeURIComponent(`${name} — contact card`);
  const shareLink = encodeURIComponent(contact.url);

  async function savePortal(disabled: boolean) {
    setPortalBusy(true);
    setPortalNote(null);
    const body = new FormData();
    body.set("login_email", loginEmail.trim());
    body.set("portal_disabled", disabled ? "1" : "0");
    const res = await api(`/api/admin/contacts/${id}/portal`, { method: "POST", body });
    const out = await res.json().catch(() => null);
    setPortalBusy(false);
    if (!res.ok) {
      setPortalNote(out?.detail ?? `Could not save that (${res.status}).`);
      return;
    }
    setPortalNote(
      loginEmail.trim() ? "Saved. Send them a code so they can set a password." : "Sign-in removed.",
    );
    apiJson<Loaded>(`/api/admin/contacts/${id}`).then(setContact).catch(() => {});
  }

  async function invite() {
    setPortalBusy(true);
    setPortalNote(null);
    const res = await api(`/api/admin/contacts/${id}/invite`, { method: "POST" });
    const out = await res.json().catch(() => null);
    setPortalBusy(false);
    setPortalNote(
      res.ok
        ? `Code sent to ${out.sent_to}. It lasts 30 minutes.`
        : (out?.detail ?? `Could not send it (${res.status}).`),
    );
  }

  async function remove() {
    const res = await api(`/api/admin/contacts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Could not delete this contact (${res.status}).`);
      return;
    }
    router.push(`/admin/companies/${contact!.company_id}`);
    router.refresh();
  }

  return (
    <>
      <nav className="mb-4">
        <Link
          href={`/admin/companies/${contact.company_id}`}
          className="text-sm font-semibold text-cyan-ink hover:underline"
        >
          Back to the company
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[contact.job_title as string, (contact.org as string) || (company?.name as string)]
              .filter(Boolean)
              .join(" · ") || "No job title yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={path} target="_blank" rel="noreferrer" className="btn">
            <Icon name="link" className="size-4" />
            Open the card
          </a>
          <Link href={`/admin/contacts/${id}/edit`} className="btn btn-primary">
            Edit
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,300px)]">
        {/* What the card actually looks like, live. */}
        <section className="surface overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-display text-sm font-bold">
            The card as people see it
          </h2>
          <iframe
            title={`Preview of ${name}'s card`}
            src={path}
            className="h-[560px] w-full bg-wash"
          />
        </section>

        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="font-display text-sm font-bold">Share it</h2>
            <div className="mt-3">
              <CopyLink value={contact.url} label="Anyone with this link can save the contact" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`/api/public/${contact.public_id}/qr.png`} download className="btn">
                <Icon name="download" className="size-4" />
                QR code (PNG)
              </a>
              <a href={`/api/public/${contact.public_id}.vcf`} download className="btn">
                <Icon name="download" className="size-4" />
                Contact file (.vcf)
              </a>
            </div>

            <ul className="mt-4 flex flex-wrap gap-2">
              {[
                { label: "WhatsApp", href: `https://wa.me/?text=${shareText}%20${shareLink}` },
                {
                  label: "LinkedIn",
                  href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareLink}`,
                },
                { label: "X", href: `https://x.com/intent/post?text=${shareText}&url=${shareLink}` },
                {
                  label: "Facebook",
                  href: `https://www.facebook.com/sharer/sharer.php?u=${shareLink}`,
                },
                { label: "Email", href: `mailto:?subject=${shareText}&body=${shareLink}` },
              ].map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="chip hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-ink-soft">Email signature</span>
                <select
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  className="field"
                >
                  {SIGNATURES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label} — {s.hint}
                    </option>
                  ))}
                </select>
              </label>
              <a href={sigUrl} target="_blank" rel="noreferrer" className="btn">
                Open it
              </a>
            </div>
            <iframe
              title="Signature preview"
              src={sigUrl}
              className="mt-3 h-56 w-full rounded-xl border border-line bg-paper"
            />
            <p className="mt-2 text-xs text-ink-soft">
              Open it, select all, copy, then paste into Outlook&rsquo;s signature editor. The QR
              and the link both open this card.
            </p>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-sm font-bold">What is on the card</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2">
              {[
                ["Company", (company?.name as string) ?? "—"],
                ["Branch", (company?.branch as string) || "—"],
                [
                  "Card language",
                  LANGUAGES.find((l) => l.code === company?.language)?.label ?? "English",
                ],
                [
                  "Background",
                  THEMES.find((t) => t.key === company?.theme)?.label ?? "Plain",
                ],
                ["Photo", contact.photo_url ? "Yes" : "No photo yet"],
                ["Fields", `${contact.fields.length}`],
                ["Link id", contact.public_id],
                ["Last changed", when(contact.updated_at as string)],
              ].map(([term, detail]) => (
                <div key={term} className="flex gap-3 text-sm">
                  <dt className="w-32 shrink-0 text-ink-soft">{term}</dt>
                  <dd
                    className={`min-w-0 font-semibold ${
                      term === "Link id" ? "break-all font-mono text-xs" : "break-words"
                    }`}
                  >
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-sm font-bold">Their own sign-in</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Give this person a page of their own, where they can get their link, their QR code
              and their email signature. You create the account here; they set the password from a
              code we email them.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-60 flex-1 space-y-1.5">
                <span className="text-sm font-semibold text-ink-soft">Sign-in email</span>
                <input
                  type="text"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="field"
                />
              </label>
              <button
                type="button"
                disabled={portalBusy}
                onClick={() => savePortal(contact!.portal_disabled)}
                className="btn btn-primary"
              >
                Save
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={portalBusy || !contact.login_email}
                onClick={invite}
                className="btn"
              >
                <Icon name="mail" className="size-4" />
                {contact.has_password ? "Email a reset code" : "Email the sign-in code"}
              </button>
              {contact.login_email ? (
                <button
                  type="button"
                  disabled={portalBusy}
                  onClick={() => savePortal(!contact!.portal_disabled)}
                  className="btn"
                >
                  {contact.portal_disabled ? "Switch it back on" : "Switch it off"}
                </button>
              ) : null}
              <span className="chip">
                {!contact.login_email
                  ? "No account"
                  : contact.portal_disabled
                    ? "Switched off"
                    : contact.has_password
                      ? "Password set"
                      : "Waiting for their code"}
              </span>
            </div>
            {portalNote ? (
              <p aria-live="polite" className="confirm mt-2 text-sm text-ink-soft">
                {portalNote}
              </p>
            ) : null}
          </section>

          <section className="surface p-5">
            <h2 className="font-display text-sm font-bold">Remove this card</h2>
            <p className="mt-1 text-sm text-ink-soft">
              The share link stops working immediately. Anyone who already saved the contact keeps
              what they saved.
            </p>
            {confirming ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={remove} className="btn btn-dark">
                  Yes, delete {name}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="btn">
                  Keep it
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="btn mt-3">
                Delete
              </button>
            )}
          </section>
        </div>

        {/* How the card is doing */}
        <section className="surface h-fit p-5 xl:sticky xl:top-6">
          <h2 className="font-display text-sm font-bold">Activity</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Counted on this server. No IP addresses are stored, so there is no location here.
          </p>

          <ul className="mt-4 space-y-2">
            {COUNTERS.map((c) => (
              <li key={c.kind} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-wash text-cyan-ink">
                  <Icon name={c.icon} className="size-4" />
                </span>
                <span className="font-display text-xl font-bold">
                  {stats?.by_kind?.[c.kind] ?? 0}
                </span>
                <span className="text-sm text-ink-soft">{c.label}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-ink-soft">Last activity: {when(stats?.last_seen ?? null)}</p>

          {stats?.days?.length ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-ink-soft">Opens, last 30 days</h3>
              <ul className="mt-2 flex h-20 items-end gap-1">
                {stats.days.map((d) => (
                  <li
                    key={d.day}
                    title={`${d.day}: ${d.n}`}
                    style={{ height: `${Math.max(8, (d.n / peak) * 100)}%` }}
                    className="grad-cyan w-2 rounded-t-sm"
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {stats?.sources?.length ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-ink-soft">Where opens came from</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {stats.sources.map((s) => (
                  <li key={s.source} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-ink-soft">{s.source}</span>
                    <span className="font-semibold">{s.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
