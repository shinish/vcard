"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type AddressValue,
  type Company,
  type ContactField,
  type Kind,
  LABELS,
  type Me,
  api,
  companyLabel,
} from "../lib/api";
import CompanyPicker from "./CompanyPicker";
import ImagePicker from "./ImagePicker";
import CreatedPanel from "./CreatedPanel";
import FieldRow from "./FieldRow";

type Loaded = {
  id: number;
  public_id: string;
  fields: ContactField[];
  photo_url: string | null;
} & Record<string, unknown>;

/** Common titles, offered as suggestions. A datalist rather than a select so
 *  an unusual title can still be typed. */
const PREFIXES = [
  "Mr",
  "Mrs",
  "Ms",
  "Miss",
  "Dr",
  "Prof",
  "Eng",
  "Sheikh",
  "Sayyid",
  "Capt",
  "Rev",
  "Hon",
];

const NAME_FIELDS: {
  name: string;
  label: string;
  required?: boolean;
  list?: string;
}[] = [
  { name: "prefix", label: "Prefix", list: "prefix-options" },
  { name: "first_name", label: "First name", required: true },
  { name: "middle_name", label: "Middle name" },
  { name: "last_name", label: "Last name" },
  { name: "suffix", label: "Suffix" },
  { name: "nickname", label: "Nickname" },
  { name: "phonetic_first", label: "Phonetic first" },
  { name: "phonetic_last", label: "Phonetic last" },
];

const WORK_FIELDS = [
  { name: "org", label: "Company on the card" },
  { name: "department", label: "Department" },
  { name: "job_title", label: "Job title" },
];

const QUICK: Kind[] = ["phone", "email", "url", "address", "date"];
const MORE: Kind[] = ["social", "im", "relation"];

function blank(kind: Kind): ContactField {
  const value =
    kind === "address"
      ? ({ street: "", city: "", region: "", postal: "", country: "" } as AddressValue)
      : "";
  return { kind, label: LABELS[kind][0], value };
}

/** A new contact starts from its company's own details: the work phone,
 *  email, website and address are almost always the same, so they are copied
 *  in rather than retyped. Everything stays editable afterwards, and editing
 *  the company later does not reach back into contacts already made. */
function seedFromCompany(company: Company | undefined): ContactField[] {
  if (!company) return [blank("phone"), blank("email")];
  const seeded: ContactField[] = [];
  if (company.phone) seeded.push({ kind: "phone", label: "work", value: company.phone });
  if (company.email) seeded.push({ kind: "email", label: "work", value: company.email });
  if (company.website) seeded.push({ kind: "url", label: "homepage", value: company.website });
  const address: AddressValue = {
    street: company.street ?? "",
    city: company.city ?? "",
    region: company.region ?? "",
    postal: company.postal ?? "",
    country: company.country ?? "",
  };
  if (Object.values(address).some(Boolean)) {
    seeded.push({ kind: "address", label: "work", value: address });
  }
  // a personal mobile is the one thing the company cannot supply
  seeded.unshift(blank("phone"));
  return seeded.length ? seeded : [blank("phone"), blank("email")];
}

export default function ContactForm({
  companies,
  contact,
  presetCompanyId,
}: {
  me: Me;
  companies: Company[];
  contact?: Loaded;
  presetCompanyId?: string | null;
}) {
  const router = useRouter();
  const initialCompanyId = String(
    (contact?.company_id as number | undefined) ?? presetCompanyId ?? companies[0]?.id ?? "",
  );
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const chosen = companies.find((c) => String(c.id) === companyId);
  const [fields, setFields] = useState<ContactField[]>(
    contact?.fields?.length ? contact.fields : seedFromCompany(
      companies.find((c) => String(c.id) === initialCompanyId),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{
    url: string;
    name: string;
    company: string;
    public_id: string;
  } | null>(null);

  const input =
    "field";
  const labelled = "block text-sm font-semibold text-ink-soft";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    // Blank rows are dropped server-side too; this just keeps the payload tidy.
    body.set("fields", JSON.stringify(fields.filter((f) => f.label.trim())));
    setBusy(true);
    setError(null);
    try {
      const res = await api(
        contact ? `/api/admin/contacts/${contact.id}` : "/api/admin/contacts",
        { method: contact ? "PATCH" : "POST", body },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not save (${res.status}).`);
      }
      const saved = await res.json();
      if (contact) {
        router.push("/admin");
        router.refresh();
        return;
      }
      setMade({
        url: saved.url,
        public_id: saved.public_id,
        name: [body.get("first_name"), body.get("last_name")].filter(Boolean).join(" "),
        company: chosen ? companyLabel(chosen) : "—",
      });
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "Could not reach the server. Is the API running on port 8000?"
          : (cause as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  if (made) {
    return (
      <CreatedPanel
        heading={`${made.name} has a card`}
        summary={[
          { term: "Name", detail: made.name },
          { term: "Company", detail: made.company },
        ]}
        links={[{ label: "Share link — anyone with it can save the contact", value: made.url }]}
        extras={
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/public/${made.public_id}/qr.png`}
              download
              className="inline-block border border-ink px-4 py-2 font-display text-sm font-semibold hover:bg-ink hover:text-white"
            >
              Download QR code (PNG)
            </a>
            <a
              href={`/api/public/${made.public_id}/signature.html`}
              target="_blank"
              rel="noreferrer"
              className="inline-block border border-ink px-4 py-2 font-display text-sm font-semibold hover:bg-ink hover:text-white"
            >
              Outlook signature
            </a>
          </div>
        }
        primary={{ href: made.url.replace(/^https?:\/\/[^/]+/, ""), text: "Open the card" }}
        secondary={{
          text: "Add another",
          onClick: () => {
            setMade(null);
            setFields([blank("phone"), blank("email")]);
          },
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-7">
      <header>
        <h1 className="font-display text-2xl font-bold">
          {contact ? "Edit contact" : "New contact"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {contact
            ? "The share link stays the same, so anyone who already has it sees the changes."
            : "You will get a share link as soon as this is saved."}
        </p>
      </header>

      <section className="surface p-6">
        <label htmlFor="company-picker" className={labelled}>
          Belongs to
        </label>
        {!contact && chosen ? (
          <p className="mt-1 text-xs text-ink-soft">
            Its phone, email, website and address are filled in below. Edit freely.
          </p>
        ) : null}
        <div className="mt-1.5">
          <CompanyPicker
            companies={companies}
            value={companyId}
            onChange={(next) => {
              setCompanyId(next);
              // only reseed while creating; an existing contact keeps its own
              if (!contact) {
                setFields(seedFromCompany(companies.find((c) => String(c.id) === next)));
              }
            }}
          />
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="font-display text-lg font-bold">Name</h2>
        <datalist id="prefix-options">
          {PREFIXES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {NAME_FIELDS.map((f) => (
            <label key={f.name} className="block space-y-1.5">
              <span className={labelled}>
                {f.label}
                {f.required ? " (required)" : ""}
              </span>
              <input
                name={f.name}
                required={f.required}
                list={f.list}
                defaultValue={(contact?.[f.name] as string) ?? ""}
                className={input}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="font-display text-lg font-bold">Work</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {WORK_FIELDS.map((f) => (
            <label key={f.name} className="block space-y-1.5">
              <span className={labelled}>{f.label}</span>
              <input
                name={f.name}
                defaultValue={
                  (contact?.[f.name] as string) ??
                  (f.name === "org" && chosen ? chosen.name : "")
                }
                key={f.name === "org" ? `org-${companyId}` : f.name}
                className={input}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="font-display text-lg font-bold">Phones, emails and the rest</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Add as many as you like. Labels match what the phone&rsquo;s address book shows.
        </p>

        <div className="mt-4 space-y-3">
          {fields.map((field, i) => (
            <FieldRow
              key={i}
              field={field}
              onChange={(next) =>
                setFields(fields.map((f, j) => (i === j ? next : f)))
              }
              onRemove={() => setFields(fields.filter((_, j) => j !== i))}
              countryHint={chosen?.country ?? null}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {QUICK.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setFields([...fields, blank(kind)])}
              className="btn"
            >
              Add {kind}
            </button>
          ))}
          <select
            aria-label="Add another kind of field"
            value=""
            onChange={(e) => {
              if (e.target.value) setFields([...fields, blank(e.target.value as Kind)]);
            }}
            className="btn"
          >
            <option value="">Add more…</option>
            {MORE.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="surface p-6">
        <h2 className="font-display text-lg font-bold">Photo and notes</h2>
        <div className="mt-4 space-y-5">
          <ImagePicker
            name="photo"
            shape="round"
            aspect={1}
            label="Photo"
            existing={contact?.photo_url ?? null}
            hint="Crop and straighten it before saving. Stored at high quality for the card, with a smaller copy inside the contact file so phones import the picture."
          />
          <label className="block space-y-1.5">
            <span className={labelled}>Note</span>
            <textarea
              name="note"
              rows={3}
              defaultValue={(contact?.note as string) ?? ""}
              className={input}
            />
          </label>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary px-6 py-3"
      >
        {busy ? "Saving…" : contact ? "Save changes" : "Create contact"}
      </button>
    </form>
  );
}
