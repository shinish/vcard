"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import ContactForm from "../../../components/ContactForm";
import { type Company, type Me, apiJson } from "../../../lib/api";

function NewContact() {
  const search = useSearchParams();
  const preset = search.get("company_id");
  const [me, setMe] = useState<Me | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);

  useEffect(() => {
    apiJson<Me>("/api/admin/me").then(setMe).catch(() => {});
    apiJson<Company[]>("/api/admin/companies").then(setCompanies).catch(() => setCompanies([]));
  }, []);

  if (!me || companies === null) return <p className="text-ink-soft">Loading…</p>;

  return <ContactForm me={me} companies={companies} presetCompanyId={preset} />;
}

export default function NewContactPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
      <NewContact />
    </Suspense>
  );
}
