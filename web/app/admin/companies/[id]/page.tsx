"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import CopyLink from "../../../components/CopyLink";
import ImagePicker from "../../../components/ImagePicker";
import MediaManager from "../../../components/MediaManager";
import PhoneField from "../../../components/PhoneField";
import { Icon, type IconName } from "../../../components/icons";
import { COUNTRIES } from "../../../lib/countries";
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "../../../lib/i18n";
import {
  API,
  COMPANY_DETAILS,
  COMPANY_SWITCHES,
  type Company,
  DEFAULT_ACCENT,
  DEFAULT_FONT,
  DEFAULT_WALLPAPER_FIT,
  FONTS,
  type FontKey,
  type Media,
  WALLPAPER_FITS,
  type WallpaperFit,
  DEFAULT_LOGO_POSITION,
  DEFAULT_LOGO_SCALE,
  LOGO_PLACEMENT,
  LOGO_POSITIONS,
  MAX_LOGO_SCALE,
  MIN_LOGO_SCALE,
  type LogoPosition,
  MAX_ACCENTS,
  MAX_SHARE_MESSAGE,
  OFFERED_THEMES,
  THEMES,
  type ThemeKey,
  api,
  apiJson,
  companyLabel,
  paletteStyle,
} from "../../../lib/api";

type Row = {
  id: number;
  public_id: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  org: string | null;
  company: string;
  url: string;
  photo_url: string | null;
  updated_at: string;
};

const TABS: { key: string; text: string; icon: IconName }[] = [
  { key: "overview", text: "Company information", icon: "building" },
  { key: "branding", text: "Branding", icon: "grid" },
  { key: "design", text: "Card design", icon: "qr" },
  { key: "people", text: "People", icon: "people" },
  { key: "settings", text: "Settings", icon: "gear" },
];

/** The three tabs whose fields belong to the one save. */
const EDITS = ["overview", "branding", "design"];

const DETAIL_LABELS: Record<(typeof COMPANY_DETAILS)[number], string> = {
  phone: "Phone number",
  email: "Business email",
  website: "Website",
  street: "Street",
  city: "City",
  region: "State / region",
  postal: "Postal code",
  country: "Country",
};

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showing, setShowing] = useState<Row | null>(null);
  const [tab, setTab] = useState("overview");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>("plain");
  const [accents, setAccents] = useState<string[]>([DEFAULT_ACCENT]);
  const [logoAt, setLogoAt] = useState<LogoPosition>(DEFAULT_LOGO_POSITION);
  const [logoScale, setLogoScale] = useState<number>(DEFAULT_LOGO_SCALE);
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const [font, setFont] = useState<FontKey>(DEFAULT_FONT);
  const [fit, setFit] = useState<WallpaperFit>(DEFAULT_WALLPAPER_FIT);
  const [showQr, setShowQr] = useState(true);
  const [showQrDownload, setShowQrDownload] = useState(true);
  // Every company switch in one bag: they are posted and read the same way.
  const [switches, setSwitches] = useState<Record<string, boolean>>({
    public_sharing: true,
    allow_save: true,
    require_consent: false,
    allow_indexing: false,
    show_company_name: true,
    show_branch: true,
  });
  const [shareMessage, setShareMessage] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [pick, setPick] = useState(0);
  // Bumped on every save so the preview iframe reloads the card.
  const [version, setVersion] = useState(0);

  function loadCompany() {
    apiJson<Company>(`/api/admin/companies/${id}`)
      .then((c) => {
        setCompany(c);
        setTheme(c.theme ?? "plain");
        setAccents(c.accents?.length ? c.accents : [DEFAULT_ACCENT]);
        setLogoAt(c.logo_position ?? DEFAULT_LOGO_POSITION);
        setLogoScale(c.logo_scale ?? DEFAULT_LOGO_SCALE);
        setLanguage(c.language ?? DEFAULT_LANGUAGE);
        setFont(c.font ?? DEFAULT_FONT);
        setFit(c.wallpaper_fit ?? DEFAULT_WALLPAPER_FIT);
        setShowQr(Boolean(c.show_qr ?? true));
        setShowQrDownload(Boolean(c.show_qr_download ?? true));
        setSwitches(
          Object.fromEntries(
            COMPANY_SWITCHES.map((s) => [s.key, Boolean(c[s.key] ?? s.key !== "allow_indexing")]),
          ),
        );
        setShareMessage(c.share_message ?? "");
      })
      .catch((e) => setError(e.message));
  }

  function loadMedia() {
    apiJson<Media[]>(`/api/admin/companies/${id}/media`)
      .then(setMedia)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    // The editor page links back to a named tab.
    const asked = new URLSearchParams(window.location.search).get("tab");
    if (asked && TABS.some((t) => t.key === asked)) setTab(asked);
  }, []);

  useEffect(() => {
    loadCompany();
    loadMedia();
    apiJson<Row[]>(`/api/admin/contacts?company_id=${id}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [id]);

  /** One PATCH for the details and the look together.
   *
   *  The route rewrites every column it knows about, so a form that posts only
   *  half of them resets the other half to its defaults. Keeping all three
   *  panels inside one <form> — hidden, not unmounted, so their inputs still
   *  post — is what stops a name edit from wiping the branding. */
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api(`/api/admin/companies/${id}`, {
        method: "PATCH",
        body: new FormData(event.currentTarget),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not save (${res.status}).`);
      }
      setSaved(true);
      setVersion((v) => v + 1);
      loadCompany();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const people = rows ?? [];
  const person = people[Math.min(pick, Math.max(0, people.length - 1))];
  const logoSrc = company?.logo_path
    ? `${API}/api/admin/companies/${id}/logo.png?v=${company.logo_path}`
    : null;

  return (
    <>
      <nav className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/admin/companies" className="font-semibold text-brand-ink hover:underline">
          Companies
        </Link>
        <span aria-hidden="true" className="text-ink-soft">
          /
        </span>
        <span className="truncate font-semibold">{company?.name ?? "Company"}</span>
      </nav>

      <header className="surface mb-5 flex flex-wrap items-center gap-5 p-5">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-line bg-wash p-2">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API
            <img src={logoSrc} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Icon name="building" className="size-7 text-ink-soft" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold">{company?.name ?? "Company"}</h1>
            {company?.branch ? <span className="chip">{company.branch}</span> : null}
            {company ? (
              <span className={switches.public_sharing ? "badge-live" : "badge-off"}>
                {switches.public_sharing ? "Shared" : "Not shared"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Company details and card branding.{" "}
            {rows === null
              ? "Loading…"
              : `${people.length} ${people.length === 1 ? "person" : "people"} with a card.`}
            {company?.updated_at ? (
              <span className="ml-1">
                Last edited{" "}
                {new Date(company.updated_at).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person ? (
            <a
              href={`/user/${person.public_id}`}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              <Icon name="share" className="size-4" />
              View a card
            </a>
          ) : null}
          <Link href={`/admin/contacts/new?company_id=${id}`} className="btn">
            <Icon name="plus" className="size-4" />
            Add a person
          </Link>
          {EDITS.includes(tab) ? (
            <button type="submit" form="company" disabled={busy} className="btn btn-primary">
              <Icon name="check" className="size-4" />
              {busy ? "Saving…" : "Save changes"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="surface mb-6 flex gap-1 overflow-x-auto p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "true" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 font-display text-sm font-semibold transition-colors ${
              tab === t.key ? "grad-brand" : "text-ink-soft hover:bg-wash hover:text-ink"
            }`}
          >
            <Icon name={t.icon} className="size-4" />
            {t.text}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p aria-live="polite" className="confirm mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          Saved.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <form id="company" onSubmit={save} hidden={!EDITS.includes(tab)}>
            {/* --- Company information ------------------------------------ */}
            <section hidden={tab !== "overview"} className="surface p-6">
              <h2 className="font-display text-lg font-bold">Company information</h2>
              <p className="mt-1 text-sm text-ink-soft">
                These fill in automatically on a new person here. Changing them later does not
                rewrite cards that already exist.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">Company name *</span>
                  <input
                    name="name"
                    required
                    defaultValue={company?.name ?? ""}
                    onInvalid={() => setTab("overview")}
                    className="field"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">Branch</span>
                  <input
                    name="branch"
                    defaultValue={company?.branch ?? ""}
                    placeholder="Muscat"
                    className="field"
                  />
                </label>
                {(["website", "email"] as const).map((field) => (
                  <label key={field} className="block space-y-1.5">
                    <span className="text-sm font-semibold text-ink-soft">
                      {DETAIL_LABELS[field]}
                    </span>
                    <input name={field} defaultValue={company?.[field] ?? ""} className="field" />
                  </label>
                ))}
                {company ? (
                  <PhoneField
                    name="phone"
                    label={DETAIL_LABELS.phone}
                    defaultValue={company.phone ?? ""}
                  />
                ) : null}
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm font-semibold text-ink-soft">Business address</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(["street", "city", "region", "postal"] as const).map((field) => (
                    <label
                      key={field}
                      className={`block space-y-1.5 ${field === "street" ? "sm:col-span-2" : ""}`}
                    >
                      <span className="text-sm text-ink-soft">{DETAIL_LABELS[field]}</span>
                      <input name={field} defaultValue={company?.[field] ?? ""} className="field" />
                    </label>
                  ))}
                  <label className="block space-y-1.5">
                    <span className="text-sm text-ink-soft">{DETAIL_LABELS.country}</span>
                    <select
                      name="country"
                      // a select applies defaultValue at mount only, and the
                      // company arrives after: remount it when the value does
                      key={`country-${company?.country ?? ""}`}
                      defaultValue={company?.country ?? ""}
                      className="field bg-paper"
                    >
                      <option value="">Not set</option>
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            </section>

            {/* --- Branding ----------------------------------------------- */}
            <section hidden={tab !== "branding"} className="surface p-6">
              <h2 className="font-display text-lg font-bold">Branding</h2>
              <p className="mt-1 text-sm text-ink-soft">
                The logo, colours and type every card in this company is dressed with.
              </p>

              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <ImagePicker
                    name="logo"
                    shape="rect"
                    aspect={3 / 2}
                    maxEdge={512}
                    label="Company logo"
                    existing={logoSrc}
                    removeName="remove_logo"
                    hint="Trim the edges so it sits tight on the card. A transparent PNG keeps its transparency."
                  />
                  <Link href={`/admin/companies/${id}/image?field=logo`} className="btn mt-1">
                    <Icon name="grid" className="size-4" />
                    Edit image on its own page
                  </Link>

                  <div className="pt-3">
                    <ImagePicker
                      name="favicon"
                      shape="rect"
                      aspect={1}
                      maxEdge={256}
                      label="Browser icon"
                      existing={
                        company?.favicon_path
                          ? `${API}/api/admin/companies/${id}/favicon.png?v=${company.favicon_path}`
                          : null
                      }
                      removeName="remove_favicon"
                      hint="The little square in a browser tab when someone opens a card. Square, and legible at 32 px."
                    />
                    <Link
                      href={`/admin/companies/${id}/image?field=favicon`}
                      className="btn mt-2"
                    >
                      <Icon name="grid" className="size-4" />
                      Edit icon on its own page
                    </Link>
                  </div>

                  <fieldset className="pt-2">
                    <legend className="text-sm font-semibold text-ink-soft">Where it sits</legend>
                    <div className="mt-2 grid w-28 grid-cols-3 grid-rows-3 gap-1">
                      {/* the centre is where the card's own content goes */}
                      <span
                        aria-hidden="true"
                        className="col-start-2 row-start-2 block size-8 border border-dashed border-line"
                      />
                      {LOGO_POSITIONS.map((slot) => (
                        <label
                          key={slot}
                          title={slot.replace("-", " ")}
                          className={`${LOGO_PLACEMENT[slot]} block size-8 cursor-pointer border has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand ${
                            logoAt === slot ? "grad-brand border-brand" : "border-line hover:border-ink"
                          }`}
                        >
                          <input
                            type="radio"
                            name="logo_position"
                            value={slot}
                            checked={logoAt === slot}
                            onChange={() => setLogoAt(slot)}
                            className="sr-only"
                          />
                          <span className="sr-only">{slot.replace("-", " ")}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">
                      Currently {logoAt.replace("-", " ")}.
                    </p>
                  </fieldset>

                  <label className="block space-y-1.5 pt-2">
                    <span className="text-sm font-semibold text-ink-soft">
                      Logo size — {logoScale}%
                    </span>
                    <input
                      type="range"
                      name="logo_scale"
                      min={MIN_LOGO_SCALE}
                      max={MAX_LOGO_SCALE}
                      step={10}
                      value={logoScale}
                      onChange={(e) => setLogoScale(Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                    <span className="block text-xs text-ink-soft">
                      Applies on the card and inside the QR code, where it is capped so the code
                      still scans.
                    </span>
                  </label>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <span className="block text-sm font-semibold text-ink-soft">Colours</span>
                    <input
                      type="hidden"
                      name="accents"
                      value={JSON.stringify(accents.filter(Boolean))}
                    />
                    {accents.map((colour, i) => (
                      <span key={i} className="flex gap-2">
                        <input
                          type="color"
                          value={colour}
                          onChange={(e) =>
                            setAccents(accents.map((c, j) => (i === j ? e.target.value : c)))
                          }
                          aria-label={`Colour ${i + 1} picker`}
                          className="h-11 w-14 shrink-0 rounded-lg border border-line bg-paper p-1"
                        />
                        <input
                          aria-label={`Colour ${i + 1}`}
                          value={colour}
                          onChange={(e) =>
                            setAccents(accents.map((c, j) => (i === j ? e.target.value : c)))
                          }
                          pattern="#[0-9a-fA-F]{6}"
                          className="field min-w-0 flex-1 font-mono text-sm"
                        />
                        {accents.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setAccents(accents.filter((_, j) => j !== i))}
                            className="shrink-0 px-2 text-sm font-semibold text-ink-soft underline hover:text-ink"
                          >
                            Remove
                          </button>
                        ) : null}
                      </span>
                    ))}
                    {accents.length < MAX_ACCENTS ? (
                      <button
                        type="button"
                        onClick={() => setAccents([...accents, DEFAULT_ACCENT])}
                        className="btn"
                      >
                        Add a colour
                      </button>
                    ) : null}
                    <span className="block text-xs text-ink-soft">
                      First colour leads; the second ends the Gradient; the third tints the Rays
                      and the rule under the name. Up to {MAX_ACCENTS}.
                    </span>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-ink-soft">Card language</span>
                    <select
                      name="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className="field"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.native} — {l.label}
                        </option>
                      ))}
                    </select>
                    <span className="block text-xs text-ink-soft">
                      The language a card opens in. Whoever opens it can switch to any of the
                      four. Arabic also lays the card out right-to-left. What you type — names,
                      job titles, notes — is shown exactly as entered.
                    </span>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-ink-soft">Type</span>
                    <select
                      name="font"
                      value={font}
                      onChange={(e) => setFont(e.target.value as FontKey)}
                      className="field"
                    >
                      {FONTS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label} — {f.hint}
                        </option>
                      ))}
                    </select>
                    <span className={`block text-xs text-ink-soft type-${font}`}>
                      <span className="font-display text-base font-bold">
                        Headings look like this
                      </span>
                      <br />
                      and the body copy reads like this.
                    </span>
                  </label>
                </div>
              </div>
            </section>

            {/* --- Card design -------------------------------------------- */}
            <section hidden={tab !== "design"} className="surface p-6">
              <h2 className="font-display text-lg font-bold">Card design</h2>
              <p className="mt-1 text-sm text-ink-soft">
                How this company&rsquo;s cards look to anyone who opens a share link.
              </p>

              <fieldset className="mt-5">
                <legend className="text-sm font-semibold text-ink-soft">
                  Background template
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {/* the nine on offer, plus whatever this company already wears */}
                  {THEMES.filter(
                    (t) => OFFERED_THEMES.some((o) => o.key === t.key) || t.key === theme,
                  ).map((t) => (
                    <label
                      key={t.key}
                      className={`block cursor-pointer rounded-xl border p-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                        theme === t.key ? "border-brand" : "border-line hover:border-ink"
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={t.key}
                        checked={theme === t.key}
                        onChange={() => setTheme(t.key)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`card-page tpl-${t.key} flex h-20 items-center justify-center rounded-lg`}
                        style={paletteStyle(accents)}
                      >
                        <span className="block h-9 w-12 rounded border border-line bg-paper" />
                      </span>
                      <span className="mt-2 block font-display text-sm font-semibold">
                        {t.label}
                      </span>
                      <span className="block text-xs text-ink-soft">{t.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Always posted: the radios below only exist while the wallpaper
                  template is chosen, and a missing field saves as the default. */}
              <input type="hidden" name="wallpaper_fit" value={fit} />

              {theme === "wallpaper" ? (
                <div className="mt-5 rounded-xl border border-line bg-wash p-4">
                  <ImagePicker
                    name="wallpaper"
                    shape="rect"
                    aspect={9 / 16}
                    maxEdge={1920}
                    label="Wallpaper"
                    existing={
                      company?.wallpaper_path
                        ? `${API}/api/admin/companies/${id}/wallpaper.jpg?v=${company.wallpaper_path}`
                        : null
                    }
                    removeName="remove_wallpaper"
                    hint="Fills the screen behind the card. Crop it tall: most people open a card on a phone."
                  />
                  <fieldset className="mt-4">
                    <legend className="text-sm font-semibold text-ink-soft">How it fills</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {WALLPAPER_FITS.map((f) => (
                        <label
                          key={f.key}
                          className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${
                            fit === f.key
                              ? "grad-brand border-brand"
                              : "border-line bg-paper hover:border-ink"
                          }`}
                        >
                          <input
                            type="radio"
                            name="wallpaper_fit_choice"
                            checked={fit === f.key}
                            onChange={() => setFit(f.key)}
                            className="sr-only"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">
                      {WALLPAPER_FITS.find((f) => f.key === fit)?.hint}
                    </p>
                  </fieldset>
                </div>
              ) : null}

              <fieldset className="mt-6">
                <legend className="text-sm font-semibold text-ink-soft">QR code on the card</legend>
                <div className="mt-2 space-y-2">
                  <Switch
                    name="show_qr"
                    checked={showQr}
                    onChange={setShowQr}
                    label="Show the QR code"
                  />
                  <Switch
                    name="show_qr_download"
                    checked={showQrDownload}
                    disabled={!showQr}
                    onChange={setShowQrDownload}
                    label="Offer the download button under it"
                  />
                </div>
              </fieldset>
            </section>
          </form>

          {/* Its own uploads, so it cannot nest inside the form above. */}
          {tab === "design" ? (
            <div className="mt-6">
              <MediaManager companyId={id} media={media} onChange={loadMedia} />
            </div>
          ) : null}

          {/* --- People --------------------------------------------------- */}
          {tab === "people" ? (
            rows === null ? (
              <p className="text-ink-soft">Loading…</p>
            ) : people.length === 0 ? (
              <div className="surface max-w-xl p-8">
                <h2 className="font-display text-lg font-bold">Nobody here yet</h2>
                <p className="mt-2 text-sm text-ink-soft">
                  Add the first person and you will get a link to share.
                </p>
              </div>
            ) : (
              <div className="surface divide-y divide-line overflow-hidden">
                {people.map((row) => (
                  <article key={row.id} className="flex flex-wrap items-center gap-4 p-4">
                    {row.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- pre-sized by the API
                      <img
                        src={row.photo_url}
                        alt=""
                        className="size-11 shrink-0 rounded-full border border-line object-cover"
                      />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line font-display text-sm text-ink-soft">
                        {(row.first_name?.[0] ?? "") + (row.last_name?.[0] ?? "")}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-semibold">
                        {[row.first_name, row.last_name].filter(Boolean).join(" ")}
                      </p>
                      <p className="truncate text-sm text-ink-soft">
                        {[row.job_title, row.org].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => setShowing(showing?.id === row.id ? null : row)}
                        className="btn"
                      >
                        Link
                      </button>
                      <Link href={`/admin/contacts/${row.id}`} className="btn">
                        Open
                      </Link>
                      <Link href={`/admin/contacts/${row.id}/edit`} className="btn">
                        Edit
                      </Link>
                    </div>

                    {showing?.id === row.id ? (
                      <div className="w-full border-t border-line pt-4">
                        <CopyLink label="Share link" value={row.url} />
                        <div className="mt-2 flex flex-wrap gap-4">
                          <a
                            href={`/api/public/${row.public_id}/qr.png`}
                            download
                            className="text-sm font-semibold text-brand-ink underline hover:text-ink"
                          >
                            Download QR code (PNG)
                          </a>
                          <a
                            href={`/api/public/${row.public_id}/signature.html`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-brand-ink underline hover:text-ink"
                          >
                            Outlook signature
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )
          ) : null}

          {/* --- Settings -------------------------------------------------- */}
          {tab === "settings" ? (
            <div className="grid gap-5 md:grid-cols-[11rem_minmax(0,1fr)]">
              <nav className="surface h-fit p-2">
                {[
                  { id: "general", text: "General" },
                  { id: "privacy", text: "Sharing & privacy" },
                  { id: "data", text: "Data" },
                  { id: "danger", text: "Danger zone" },
                ].map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-wash hover:text-ink"
                  >
                    {item.text}
                  </a>
                ))}
              </nav>

              <div className="space-y-5">
                <section id="general" className="surface p-6">
                  <h2 className="font-display text-lg font-bold">General</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    What this company is set to. Change any of it on the tab named beside it.
                  </p>
                  <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {[
                      { term: "Name", value: company ? companyLabel(company) : "—", tab: "overview" },
                      { term: "Link name", value: company?.slug ?? "—", tab: "overview" },
                      {
                        term: "Card language",
                        value: LANGUAGES.find((l) => l.code === language)?.native ?? language,
                        tab: "branding",
                      },
                      {
                        term: "Background template",
                        value: THEMES.find((t) => t.key === theme)?.label ?? theme,
                        tab: "design",
                      },
                      {
                        term: "Colours",
                        value: `${accents.length} ${accents.length === 1 ? "colour" : "colours"}`,
                        tab: "branding",
                      },
                      {
                        term: "QR code",
                        value: showQr ? "Shown on the card" : "Hidden",
                        tab: "design",
                      },
                    ].map((row) => (
                      <div key={row.term} className="flex items-baseline gap-3 text-sm">
                        <dt className="w-36 shrink-0 text-ink-soft">{row.term}</dt>
                        <dd className="min-w-0 flex-1 break-words font-semibold">
                          {row.value}{" "}
                          <button
                            type="button"
                            onClick={() => setTab(row.tab)}
                            className="text-xs font-semibold text-brand-ink underline hover:text-ink"
                          >
                            edit
                          </button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section id="privacy" className="surface p-6">
                  <h2 className="font-display text-lg font-bold">Sharing & privacy</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    How this company&rsquo;s cards may be shared and saved. Save on this tab.
                  </p>

                  <div className="mt-4 space-y-3">
                    {COMPANY_SWITCHES.map((s) => (
                      <Switch
                        key={s.key}
                        name={s.key}
                        form="company"
                        checked={switches[s.key] ?? false}
                        onChange={(on) => setSwitches({ ...switches, [s.key]: on })}
                        label={s.label}
                        hint={s.hint}
                        disabled={s.key !== "public_sharing" && !switches.public_sharing}
                      />
                    ))}
                  </div>

                  <label className="mt-5 block space-y-1.5">
                    <span className="text-sm font-semibold text-ink-soft">
                      Default sharing message
                    </span>
                    <textarea
                      name="share_message"
                      form="company"
                      rows={2}
                      maxLength={MAX_SHARE_MESSAGE}
                      value={shareMessage}
                      onChange={(e) => setShareMessage(e.target.value)}
                      placeholder="Here is my contact card."
                      className="field"
                    />
                    <span className="block text-xs text-ink-soft">
                      What the share button offers to send with the link.{" "}
                      {shareMessage.length}/{MAX_SHARE_MESSAGE}
                    </span>
                  </label>

                  <button type="submit" form="company" disabled={busy} className="btn btn-primary mt-4">
                    {busy ? "Saving…" : "Save these settings"}
                  </button>

                  <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm text-ink-soft">
                    <li>
                      Every card is public to whoever holds its link: 22 random characters, no
                      sign-in. Deleting a person is what revokes their link.
                    </li>
                    <li>
                      Opens and taps are counted per card. No IP address, location or device is
                      stored, so a visitor cannot be identified or counted twice.
                    </li>
                    <li>
                      Card holders can be given their own sign-in from their page, which shows
                      them the same counts for their own card and nothing else.
                    </li>
                  </ul>
                  <Link
                    href={`/admin/analytics?company=${id}`}
                    className="btn mt-4"
                  >
                    <Icon name="chart" className="size-4" />
                    See this company&rsquo;s analytics
                  </Link>
                </section>

                <section id="data" className="surface p-6">
                  <h2 className="font-display text-lg font-bold">Data</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    Everything this company holds, in a file you keep. The export is the data;
                    the backup is the whole database, pictures aside.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`/api/admin/export.json?company_id=${id}`} download className="btn">
                      <Icon name="download" className="size-4" />
                      Export this company (JSON)
                    </a>
                    <a href="/api/admin/backup.db" download className="btn">
                      <Icon name="download" className="size-4" />
                      Download a database backup
                    </a>
                  </div>
                </section>

                <section id="danger" className="surface p-6">
              <h2 className="font-display text-lg font-bold">Delete this company</h2>
              {!confirmingDelete ? (
                <>
                  <p className="mt-2 max-w-prose text-sm text-ink-soft">
                    Removes the company and everyone in it. This cannot be undone.
                  </p>
                  <button
                    onClick={() => {
                      setConfirmingDelete(true);
                      setDeleteError(null);
                    }}
                    className="mt-4 btn"
                  >
                    Delete this company
                  </button>
                </>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setBusy(true);
                    setDeleteError(null);
                    try {
                      const res = await api(`/api/admin/companies/${id}`, {
                        method: "DELETE",
                        body: new FormData(event.currentTarget),
                      });
                      if (!res.ok) {
                        const detail = await res.json().catch(() => null);
                        throw new Error(detail?.detail ?? `Could not delete (${res.status}).`);
                      }
                      router.push("/admin/companies");
                      router.refresh();
                    } catch (cause) {
                      setDeleteError((cause as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="mt-4 max-w-xl"
                >
                  <div className="border-l-2 border-ink bg-wash px-4 py-3">
                    <p className="font-display font-semibold">
                      This deletes {company ? companyLabel(company) : "this company"} and
                      everything in it.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                      <li>
                        {people.length} {people.length === 1 ? "person" : "people"} and their
                        contact cards
                      </li>
                      <li>Every share link already handed out stops working</li>
                      <li>Uploaded photos are removed from the server</li>
                      <li>None of it can be recovered</li>
                    </ul>
                  </div>

                  <label className="mt-4 block space-y-1.5">
                    <span className="text-sm font-semibold text-ink-soft">
                      Type your own password to confirm
                    </span>
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      className="field"
                    />
                  </label>

                  {deleteError ? (
                    <p role="alert" className="mt-3 border-l-2 border-brand bg-wash px-3 py-2 text-sm">
                      {deleteError}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="submit" disabled={busy} className="btn btn-dark">
                      {busy ? "Deleting…" : "Delete permanently"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="btn"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
                </section>
              </div>
            </div>
          ) : null}
        </div>

        {/* --- Live preview ------------------------------------------------
            The real card in an iframe rather than a mock-up of one: there is
            only one renderer to keep honest. */}
        <aside className="surface h-fit p-4 xl:sticky xl:top-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">Live card preview</h2>
              <p className="text-xs text-ink-soft">Saved changes show here.</p>
            </div>
            <div className="flex gap-1 rounded-full bg-wash p-1">
              {[
                { key: false, text: "Phone" },
                { key: true, text: "Desktop" },
              ].map((o) => (
                <button
                  key={o.text}
                  type="button"
                  onClick={() => setWide(o.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    wide === o.key ? "grad-brand" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {o.text}
                </button>
              ))}
            </div>
          </div>

          {person ? (
            <>
              <div
                className={`mx-auto mt-4 overflow-hidden border-4 border-ink bg-paper ${
                  wide ? "aspect-[4/3] w-full rounded-xl" : "aspect-[9/19] w-full max-w-[16rem] rounded-[2rem]"
                }`}
              >
                <iframe
                  key={`${person.public_id}-${version}-${wide}`}
                  src={`/user/${person.public_id}`}
                  title={`Card preview for ${person.first_name}`}
                  className="size-full"
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPick((p) => Math.max(0, p - 1))}
                  disabled={pick === 0}
                  aria-label="Previous person"
                  className="btn px-3 disabled:opacity-40"
                >
                  ‹
                </button>
                <p className="min-w-0 flex-1 truncate text-center text-xs text-ink-soft">
                  {[person.first_name, person.last_name].filter(Boolean).join(" ")} ·{" "}
                  {pick + 1}/{people.length}
                </p>
                <button
                  type="button"
                  onClick={() => setPick((p) => Math.min(people.length - 1, p + 1))}
                  disabled={pick >= people.length - 1}
                  aria-label="Next person"
                  className="btn px-3 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Nobody here yet: the panel still shows what a card will look
                  like, dressed in this company's template, colours and type. */}
              <div
                className={`mx-auto mt-4 overflow-hidden border-4 border-ink bg-paper ${
                  wide ? "aspect-[4/3] w-full rounded-xl" : "aspect-[9/19] w-full max-w-[16rem] rounded-[2rem]"
                }`}
              >
                <div
                  className={`card-page tpl-${theme} type-${font} flex h-full flex-col items-center justify-center p-4`}
                  style={paletteStyle(accents)}
                >
                  <div className="w-full max-w-[12rem] rounded-xl bg-paper p-3 text-center shadow-soft">
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- served by the API
                      <img src={logoSrc} alt="" className="mx-auto mb-2 h-6 w-auto object-contain" />
                    ) : null}
                    <span className="mx-auto block size-12 rounded-full border border-line bg-wash" />
                    <span className="mt-2 block font-display text-sm font-bold">Their name</span>
                    <span className="block text-[11px] text-ink-soft">Job title</span>
                    {switches.show_company_name ? (
                      <span className="block text-[11px] text-ink-soft">{company?.name}</span>
                    ) : null}
                    <span className="accent-rule mx-auto mt-2 block h-1 w-10 rounded-full" />
                    <span className="mt-3 block rounded-full bg-ink py-1.5 text-[11px] font-semibold text-white">
                      Save contact
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-ink-soft">
                A sample in this company&rsquo;s look. Add a person and the real card shows here.
              </p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/** A switch that always posts, as "1" or "0".
 *
 *  A bare checkbox posts nothing when it is off, and the API cannot tell that
 *  apart from a form that never asked — which is how a new company used to be
 *  created with its QR code switched off.
 */
function Switch({
  name,
  checked,
  onChange,
  label,
  hint,
  disabled,
  form,
}: {
  name: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  form?: string;
}) {
  return (
    <label className={`flex items-start gap-3 text-sm ${disabled ? "opacity-50" : ""}`}>
      <input type="hidden" name={name} value={checked ? "1" : "0"} form={form} />
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-brand"
      />
      <span className="min-w-0">
        <span className="font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-ink-soft">{hint}</span> : null}
      </span>
    </label>
  );
}
