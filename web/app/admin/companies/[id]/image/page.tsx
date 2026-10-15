"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";

import ImageEditor from "../../../../components/ImageEditor";
import { Icon, type IconName } from "../../../../components/icons";
import { API, type Company, api, apiJson, companyLabel } from "../../../../lib/api";

/** Which company picture this page is editing. Both live on the company, so
 *  both are edited here; a person's photo belongs to that person and is edited
 *  on their own page. */
const FIELDS = {
  logo: {
    title: "Edit company logo",
    blurb:
      "Crop, straighten and tune the logo, then check it at the sizes a card actually uses. A clear, high-resolution picture gives the best result.",
    file: "logo.png",
    shape: "rect" as const,
    aspect: 3 / 2,
    maxEdge: 512,
    recommended: "512 × 512 px recommended · PNG, JPG or WebP",
  },
  photo: {
    title: "Edit default photo",
    blurb:
      "The face a card wears when its holder has none of their own. Square and round-cropped, the way a phone shows a contact.",
    file: "photo.jpg",
    shape: "round" as const,
    aspect: 1,
    maxEdge: 1400,
    recommended: "600 × 600 px and up · JPG, PNG or WebP",
  },
  favicon: {
    title: "Edit browser icon",
    blurb:
      "The little square in a browser tab when someone opens a card. Square, and legible at 32 px.",
    file: "favicon.png",
    shape: "rect" as const,
    aspect: 1,
    maxEdge: 256,
    recommended: "64 × 64 px and up · PNG or WebP",
  },
};

type FieldKey = keyof typeof FIELDS;

const TABS: { key: string; text: string; icon: IconName }[] = [
  { key: "overview", text: "Company information", icon: "building" },
  { key: "branding", text: "Branding", icon: "grid" },
  { key: "design", text: "Card design", icon: "qr" },
  { key: "people", text: "People", icon: "people" },
  { key: "settings", text: "Settings", icon: "gear" },
];

function Editor({ id }: { id: string }) {
  const router = useRouter();
  const [field, setField] = useState<FieldKey>("logo");
  const [company, setCompany] = useState<Company | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [edited, setEdited] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const spec = FIELDS[field];

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("field");
    if (asked === "favicon" || asked === "logo") setField(asked);
  }, []);

  useEffect(() => {
    apiJson<Company>(`/api/admin/companies/${id}`)
      .then(setCompany)
      .catch((e) => setError(e.message));
  }, [id]);

  /** Fetch what is already saved so it can be re-cropped without hunting for
   *  the original file. */
  const loadSaved = useCallback(async () => {
    if (!company) return;
    const stored =
      field === "logo"
        ? company.logo_path
        : field === "photo"
          ? company.photo_path
          : company.favicon_path;
    if (!stored) {
      setFile(null);
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `${API}/api/admin/companies/${id}/${spec.file}?v=${stored}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Could not load the saved picture (${res.status}).`);
      const blob = await res.blob();
      setFile(new File([blob], spec.file, { type: blob.type || "image/png" }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [company, field, id, spec.file]);

  useEffect(() => {
    void loadSaved();
    setEdited(null);
    setSaved(false);
  }, [loadSaved]);

  async function save() {
    if (!edited || !company) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      // PATCH rewrites the record, so the identity rides along with the file.
      body.set("name", company.name);
      body.set("branch", company.branch ?? "");
      body.set(field, edited);
      const res = await api(`/api/admin/companies/${id}`, { method: "PATCH", body });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not save (${res.status}).`);
      }
      setSaved(true);
      router.push(`/admin/companies/${id}?tab=branding`);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const logoSrc = company?.logo_path
    ? `${API}/api/admin/companies/${id}/logo.png?v=${company.logo_path}`
    : null;

  return (
    <>
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/companies" className="font-semibold text-brand-ink hover:underline">
          Companies
        </Link>
        <span aria-hidden="true" className="text-ink-soft">
          /
        </span>
        <Link
          href={`/admin/companies/${id}`}
          className="truncate font-semibold text-brand-ink hover:underline"
        >
          {company ? companyLabel(company) : "Company"}
        </Link>
        <span aria-hidden="true" className="text-ink-soft">
          /
        </span>
        <Link
          href={`/admin/companies/${id}?tab=branding`}
          className="font-semibold text-brand-ink hover:underline"
        >
          Branding
        </Link>
        <span aria-hidden="true" className="text-ink-soft">
          /
        </span>
        <span className="truncate font-semibold">{spec.title}</span>
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
            {company ? (
              <span className={company.public_sharing ? "badge-live" : "badge-off"}>
                {company.public_sharing ? "Shared" : "Not shared"}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{spec.blurb}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/companies/${id}?tab=branding`} className="btn">
            Cancel
          </Link>
          <button type="button" onClick={save} disabled={!edited || busy} className="btn btn-primary">
            <Icon name="check" className="size-4" />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      <div className="surface mb-6 flex gap-1 overflow-x-auto p-1.5">
        <Link
          href={`/admin/companies/${id}?tab=branding`}
          className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-semibold text-ink-soft hover:bg-wash hover:text-ink"
        >
          <Icon name="arrow-right" className="size-4 rotate-180" />
          Back to company
        </Link>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/companies/${id}?tab=${t.key}`}
            aria-current={t.key === "branding" ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-semibold ${
              t.key === "branding" ? "grad-brand" : "text-ink-soft hover:bg-wash hover:text-ink"
            }`}
          >
            <Icon name={t.icon} className="size-4" />
            {t.text}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(FIELDS) as FieldKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setField(key)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold ${
              field === key ? "grad-brand border-transparent" : "border-line bg-paper hover:border-brand"
            }`}
          >
            {FIELDS[key].title.replace("Edit ", "")}
          </button>
        ))}
        <span className="chip ml-1">{spec.recommended}</span>
      </div>

      {error ? (
        <p role="alert" className="mb-5 rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p aria-live="polite" className="confirm mb-5 text-sm">
          Saved.
        </p>
      ) : null}

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold">{spec.title}</h2>
            <p className="text-sm text-ink-soft">
              {edited
                ? `Ready to save — ${Math.max(1, Math.round(edited.size / 1024))} KB`
                : file
                  ? "Adjust it, then use this picture."
                  : "Nothing saved yet. Choose a file to start."}
            </p>
          </div>
          <label className="btn cursor-pointer">
            {file ? "Choose another file" : "Choose a file"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) {
                  setFile(picked);
                  setEdited(null);
                }
              }}
            />
          </label>
        </div>

        {file ? (
          <ImageEditor
            key={`${field}-${file.name}-${file.size}`}
            file={file}
            shape={spec.shape}
            aspect={spec.aspect}
            maxEdge={spec.maxEdge}
            onDone={(result) => setEdited(result)}
            onCancel={() => void loadSaved()}
          />
        ) : (
          <p className="p-8 text-center text-sm text-ink-soft">
            Choose a picture and the editor opens here.
          </p>
        )}
      </section>

      <p className="mt-4 text-sm text-ink-soft">
        A person&rsquo;s photo is edited on their own page, since it belongs to them rather than to
        the company.{" "}
        <Link href={`/admin/companies/${id}?tab=people`} className="font-semibold text-brand-ink hover:underline">
          Open the people in this company
        </Link>
        .
      </p>
    </>
  );
}

export default function CompanyImagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
      <Editor id={id} />
    </Suspense>
  );
}
