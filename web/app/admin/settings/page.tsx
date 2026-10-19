"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { THEMES, api, apiJson } from "../../lib/api";

type Settings = {
  geocoder: string;
  geocoder_key_set: boolean;
  public_base_url: string;
  default_theme: string;
  providers: string[];
  zepto_token_set: boolean;
  zepto_dc: string;
  mail_from: string;
  mail_from_name: string;
  notify_to: string;
  notify_card_created: string;
  notify_card_updated: string;
  notify_admin_added: string;
  notify_monthly: string;
  session_hours: string;
};

const NOTIFICATIONS = [
  { key: "notify_card_created", label: "A new card is created" },
  { key: "notify_card_updated", label: "A card is edited" },
  { key: "notify_admin_added", label: "An administrator is added" },
  { key: "notify_monthly", label: "A monthly report, on the first of the month" },
];

const SESSION_CHOICES = [
  { hours: 1, label: "1 hour" },
  { hours: 8, label: "8 hours — a working day" },
  { hours: 24, label: "A day" },
  { hours: 24 * 14, label: "A fortnight" },
  { hours: 24 * 90, label: "90 days" },
];

const NEEDS_KEY = ["mapbox", "geoapify", "locationiq"];

const PROVIDER_NOTES: Record<string, string> = {
  photon: "OpenStreetMap, no account needed. Thin outside Europe and North America.",
  nominatim: "OpenStreetMap, no account needed. Richer detail, fewer matches. Its usage policy asks for no search-as-you-type, so prefer it only for occasional lookups.",
  mapbox: "Needs an API key. 100,000 free lookups a month and much better coverage in the Gulf.",
  geoapify: "Needs an API key. 3,000 free lookups a day.",
  locationiq: "Needs an API key. 5,000 free lookups a day.",
};

export default function SettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [notify, setNotify] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState("photon");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const [mailTo, setMailTo] = useState("");
  const [mailResult, setMailResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function importZip(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file twice still fires
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const made = await apiJson<{ companies: { name: string; people: number }[] }>(
        "/api/admin/import.zip",
        { method: "POST", body },
      );
      setImportResult(
        made.companies
          .map((c) => `${c.name} — ${c.people} ${c.people === 1 ? "card" : "cards"}`)
          .join(", ") || "Nothing in that file.",
      );
    } catch (cause) {
      setImportResult((cause as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function load() {
    apiJson<Settings>("/api/admin/settings")
      .then((loaded) => {
        setNotify(
          Object.fromEntries(
            NOTIFICATIONS.map((n) => [n.key, (loaded as never as Record<string, string>)[n.key] === "1"]),
          ),
        );
        return loaded;
      })
      .then((s) => {
        setData(s);
        setProvider(s.geocoder);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api("/api/admin/settings", {
        method: "PATCH",
        body: new FormData(event.currentTarget),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not save (${res.status}).`);
      }
      setSaved(true);
      load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTest("Checking…");
    try {
      const res = await api("/api/admin/settings/geocoder-test?q=Muscat");
      const body = await res.json();
      setTest(
        res.ok
          ? `${body.provider}: ${body.count} result${body.count === 1 ? "" : "s"} for “Muscat”` +
            (body.results?.[0] ? ` — e.g. ${body.results[0].label}` : "")
          : (body?.detail ?? "That did not work."),
      );
    } catch {
      setTest("Could not reach the server.");
    }
  }

  async function sendTestMail() {
    setMailResult("Sending…");
    const body = new FormData();
    body.set("to", mailTo);
    try {
      const res = await api("/api/admin/settings/mail-test", { method: "POST", body });
      const out = await res.json();
      setMailResult(res.ok ? `Sent to ${out.sent_to}. Check the inbox.` : (out?.detail ?? "That did not work."));
    } catch {
      setMailResult("Could not reach the server.");
    }
  }

  if (!data) {
    return error ? (
      <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
        {error}
      </p>
    ) : (
      <p className="text-ink-soft">Loading…</p>
    );
  }

  const field = "field";
  const labelled = "block text-sm font-semibold text-ink-soft";

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Applies to the whole app. For your own name and password, see{" "}
          <Link href="/admin/profile" className="text-brand-ink underline">
            your profile
          </Link>
          .
        </p>
      </header>

      <form onSubmit={save} className="max-w-2xl space-y-7">
        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Address lookup</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Where the address suggestions on a contact form come from.
          </p>

          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>Provider</span>
            <select
              name="geocoder"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setTest(null);
              }}
              className={`${field} bg-paper`}
            >
              {data.providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span className="block text-xs text-ink-soft">{PROVIDER_NOTES[provider]}</span>
          </label>

          {NEEDS_KEY.includes(provider) ? (
            <label className="mt-4 block space-y-1.5">
              <span className={labelled}>
                API key {data.geocoder_key_set ? "(one is saved)" : "(none saved)"}
              </span>
              <input
                name="geocoder_key"
                type="password"
                autoComplete="off"
                placeholder={data.geocoder_key_set ? "Leave blank to keep the saved key" : ""}
                className={field}
              />
              {data.geocoder_key_set ? (
                <span className="flex items-center gap-2 text-xs text-ink-soft">
                  <input type="checkbox" name="clear_geocoder_key" value="1" />
                  Remove the saved key
                </span>
              ) : null}
              <span className="block text-xs text-ink-soft">
                Stored on the server and never sent back to this page.
              </span>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              className="btn"
            >
              Test it
            </button>
            {test ? <span aria-live="polite" className="text-sm text-ink-soft">{test}</span> : null}
          </div>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Share links</h2>
          <p className="mt-1 text-sm text-ink-soft">
            The address put into share links and QR codes. Set it to whatever people outside will
            use to reach this app.
          </p>
          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>Public address</span>
            <input
              name="public_base_url"
              defaultValue={data.public_base_url}
              placeholder="https://cards.example.com"
              className={field}
            />
            <span className="block text-xs text-ink-soft">
              Cards already made pick this up straight away; the link id does not change.
            </span>
          </label>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Email</h2>
          <p className="mt-1 text-sm text-ink-soft">
            ZeptoMail sends the sign-in codes and password resets to card holders. Without this,
            nobody can set a password for their own page.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={labelled}>From address</span>
              <input
                name="mail_from"
                defaultValue={data.mail_from}
                placeholder="cards@truetap.in"
                className={field}
              />
              <span className="block text-xs text-ink-soft">
                Must be a sender ZeptoMail has verified for your domain.
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className={labelled}>From name</span>
              <input
                name="mail_from_name"
                defaultValue={data.mail_from_name}
                placeholder="TrueTap"
                className={field}
              />
            </label>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>
              ZeptoMail send-mail token {data.zepto_token_set ? "(one is saved)" : "(none saved)"}
            </span>
            <input
              name="zepto_token"
              type="password"
              autoComplete="off"
              placeholder={data.zepto_token_set ? "Leave blank to keep the saved token" : "Zoho-enczapikey …"}
              className={field}
            />
            {data.zepto_token_set ? (
              <span className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" name="clear_zepto_token" value="1" />
                Remove the saved token
              </span>
            ) : null}
            <span className="block text-xs text-ink-soft">
              Stored on the server and never sent back to this page.
            </span>
          </label>

          <label className="mt-4 block space-y-1.5 sm:max-w-xs">
            <span className={labelled}>ZeptoMail region</span>
            <select name="zepto_dc" defaultValue={data.zepto_dc || "api.zeptomail.com"} className={field}>
              <option value="api.zeptomail.com">United States — zeptomail.com</option>
              <option value="api.zeptomail.in">India — zeptomail.in</option>
              <option value="api.zeptomail.eu">Europe — zeptomail.eu</option>
              <option value="api.zeptomail.com.au">Australia — zeptomail.com.au</option>
              <option value="api.zeptomail.ca">Canada — zeptomail.ca</option>
              <option value="api.zeptomail.jp">Japan — zeptomail.jp</option>
              <option value="api.zeptomail.sa">Saudi Arabia — zeptomail.sa</option>
              <option value="api.zeptomail.com.cn">China — zeptomail.com.cn</option>
            </select>
            <span className="block text-xs text-ink-soft">
              The one your Zoho account sits in. A token from another region is refused as
              invalid, so this has to match.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={mailTo}
              onChange={(e) => setMailTo(e.target.value)}
              placeholder="you@example.com"
              aria-label="Address for the test email"
              className={`${field} sm:w-64`}
            />
            <button type="button" onClick={sendTestMail} disabled={!mailTo} className="btn">
              Send a test
            </button>
            {mailResult ? (
              <span aria-live="polite" className="text-sm text-ink-soft">
                {mailResult}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Save the settings first — the test uses what is stored.
          </p>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">New companies</h2>
          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>Background template to start with</span>
            <select
              name="default_theme"
              defaultValue={data.default_theme || "plain"}
              className={`${field} bg-paper`}
            >
              {THEMES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Notifications</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sent through the same ZeptoMail settings above. Nothing is sent until there is an
            address here.
          </p>
          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>Send notifications to</span>
            <input
              name="notify_to"
              type="email"
              defaultValue={data.notify_to}
              placeholder="you@example.com"
              className={field}
            />
          </label>
          <div className="mt-4 space-y-2">
            {NOTIFICATIONS.map((n) => (
              <label key={n.key} className="flex items-center gap-3 text-sm">
                <input
                  type="hidden"
                  name={n.key}
                  value={notify[n.key] ? "1" : "0"}
                />
                <input
                  type="checkbox"
                  checked={Boolean(notify[n.key])}
                  onChange={(e) => setNotify({ ...notify, [n.key]: e.target.checked })}
                  className="size-4 accent-brand"
                />
                <span className="font-semibold">{n.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            The monthly report goes out on the first, sent by the app itself — there is no cron
            job to install. Send the current one any time from{" "}
            <Link href="/admin/analytics" className="font-semibold text-brand-ink hover:underline">
              Analytics
            </Link>
            .
          </p>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Sign-in</h2>
          <label className="mt-4 block space-y-1.5">
            <span className={labelled}>A sign-in lasts</span>
            <select
              name="session_hours"
              defaultValue={data.session_hours || String(24 * 14)}
              className={`${field} bg-paper`}
            >
              {SESSION_CHOICES.map((c) => (
                <option key={c.hours} value={c.hours}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="block text-xs text-ink-soft">
              Applies the next time someone signs in. Sessions already open keep the length they
              were given.
            </span>
          </label>
        </section>

        <section className="surface p-6">
          <h2 className="font-display text-lg font-bold">Data</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Everything, in a file you keep. The zip carries the pictures as well and is the
            one you can import again; the JSON is the data alone, and the backup is the
            database itself, taken with SQLite&rsquo;s own backup so it cannot come out torn.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/admin/export.zip" download className="btn">
              Export everything (ZIP, with pictures)
            </a>
            <a href="/api/admin/export.json" download className="btn">
              Export everything (JSON)
            </a>
            <a href="/api/admin/backup.db" download className="btn">
              Download a database backup
            </a>
          </div>

          <h3 className="mt-6 font-display text-base font-bold">Import a zip</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Reads an exported zip back in. It always creates a new company and never changes
            an existing one, so nothing you already have can be overwritten. Cards come back
            with new addresses, and a zip from this installation arrives marked as a copy.
            Visit counts are not restored — they record what real people did.
          </p>
          <label className="mt-3 inline-flex">
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={importZip}
              disabled={importing}
              className="block text-sm file:mr-3 file:rounded-full file:border-0 file:bg-wash file:px-4 file:py-2 file:text-sm file:font-semibold"
            />
          </label>
          {importing ? <p className="mt-2 text-sm text-ink-soft">Reading the file…</p> : null}
          {importResult ? (
            <p aria-live="polite" className="mt-2 text-sm font-semibold">
              {importResult}
            </p>
          ) : null}
        </section>

        {error ? (
          <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p aria-live="polite" className="confirm text-sm">
            Settings saved.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary px-6 py-3"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
      </form>
    </>
  );
}
