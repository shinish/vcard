"use client";

import { use, useEffect, useState } from "react";

import ContactForm from "../../../../components/ContactForm";
import { type Company, type Me, apiJson } from "../../../../lib/api";

export default function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [contact, setContact] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Me>("/api/admin/me").then(setMe).catch(() => {});
    apiJson<Company[]>("/api/admin/companies").then(setCompanies).catch(() => setCompanies([]));
    apiJson<Record<string, unknown>>(`/api/admin/contacts/${id}`)
      .then(setContact)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="surface max-w-xl p-6">
        <h1 className="font-display text-xl font-bold">Cannot open this contact</h1>
        <p className="mt-2 text-sm text-ink-soft">{error}</p>
      </div>
    );
  }
  if (!me || companies === null || !contact) return <p className="text-ink-soft">Loading…</p>;

  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ContactForm me={me} companies={companies} contact={contact as any} />
    </>
  );
}
