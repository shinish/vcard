"use client";

import Link from "next/link";
import { Icon } from "../../components/icons";
import { useEffect, useState } from "react";

import {
  type Company,
  type FontKey,
  FONTS,
  OFFERED_THEMES,
  THEMES,
  type ThemeKey,
  apiJson,
  companyLabel,
  paletteStyle,
} from "../../lib/api";

/** Browse backgrounds and choose company typography. */
export default function TemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ThemeKey>("plain");
  const [companyId, setCompanyId] = useState("");
  const [selectedFont, setSelectedFont] = useState<FontKey>("poppins");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiJson<Company[]>("/api/admin/companies")
      .then(setCompanies)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const users = (key: ThemeKey) => companies.filter((c) => (c.theme ?? "plain") === key);
  const themes = THEMES.filter((theme) =>
    OFFERED_THEMES.some((o) => o.key === theme.key) || companies.some((c) => (c.theme ?? "plain") === theme.key),
  );
  const active = themes.find((theme) => theme.key === selected) ?? themes[0];
  const activeUsers = users(active.key);
  const palette = paletteStyle(activeUsers[0]?.accents ?? null);

  return (
    <div className="template-lab">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Card templates</h1>
          <p className="mt-2 text-sm text-ink-soft">Explore a new look for every introduction. Preview a design, then make it your company’s own.</p>
        </div>
        <Link href="/admin/settings" className="btn"><Icon name="gear" className="size-4" />Default settings</Link>
      </header>

      {error ? <p role="alert" className="mb-5 text-sm">{error}</p> : null}

      <section className="template-studio" aria-label="Selected template preview">
        <div className="template-studio-copy">
          <span className="template-studio-label"><span aria-hidden="true" />Template studio</span>
          <h2>{active.label}</h2>
          <p className="template-studio-description">{active.hint}. Your identity, ready for the next connection.</p>
          <div className="template-studio-tags"><span>Responsive cards</span><span>Company colours</span><span>QR sharing</span></div>
          <label className="template-company-label" htmlFor="template-company">Customize for a company</label>
          <select id="template-company" className="field" value={companyId} disabled={!loaded || !!error} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Choose a company or branch</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{companyLabel(company)}</option>)}
          </select>
          {companyId ? (
            <Link className="template-customize" href={`/admin/companies/${companyId}?tab=design`}>Open card designer<Icon name="arrow-right" className="size-4" /></Link>
          ) : (
            <button type="button" className="template-customize" disabled>Choose a company to customize<Icon name="arrow-right" className="size-4" /></button>
          )}
          <p className="template-studio-note">Preview only. Choose and save the template in the company’s card designer.</p>
        </div>

        <div className={`template-stage card-page tpl-${active.key} type-${selectedFont}`} style={palette}>
          <span className="template-stage-caption">Sample card</span>
          <div className="template-demo-card">
            <span className="template-demo-brand">Your company</span>
            <span className="template-demo-avatar"><Icon name="user" className="size-9" /></span>
            <strong>Your name</strong>
            <span className="template-demo-role">Job title · Company</span>
            <span className="template-demo-rule" />
            <div className="template-demo-actions" aria-hidden="true">
              <span><Icon name="phone" className="size-4" /></span><span><Icon name="mail" className="size-4" /></span><span><Icon name="globe" className="size-4" /></span><span><Icon name="qr" className="size-4" /></span>
            </div>
            <span className="template-demo-save"><Icon name="download" className="size-4" />Save contact</span>
          </div>
          <span className="template-stage-footnote">Background preview · {active.label}</span>
        </div>
      </section>

      <div className="template-section-heading">
        <div><h2>Find your signature look</h2><p>{themes.length} backgrounds. One consistent identity across your company.</p></div>
        <span className="chip">Select a design to preview</span>
      </div>
      <div className="template-gallery">
        {themes.map((theme) => {
          const taken = users(theme.key);
          return (
            <article key={theme.key} className={`template-option ${active.key === theme.key ? "is-selected" : ""}`}>
              <button type="button" className="template-option-button" aria-label={`Preview ${theme.label} template`} aria-pressed={active.key === theme.key} onClick={() => setSelected(theme.key)}>
                <span className={`template-option-visual card-page tpl-${theme.key}`} style={paletteStyle(taken[0]?.accents ?? null)}>
                  <span className="template-mini-card" aria-hidden="true"><span /><strong>Your name</strong><i /><span className="template-mini-actions">● ● ●</span></span>
                  {active.key === theme.key ? <span className="template-selected-mark"><Icon name="check" className="size-3.5" />Previewing</span> : <span className="template-preview-mark">Preview<Icon name="eye" className="size-3.5" /></span>}
                </span>
                <span className="template-option-title">{theme.label}</span>
                <span className="template-option-hint">{theme.hint}</span>
              </button>
              <div className="template-option-usage">
                <span>{!loaded ? "Loading usage…" : taken.length ? `Used by ${taken.length} ${taken.length === 1 ? "branch" : "branches"}` : "Ready for your next card"}</span>
                {taken.length ? <ul>{taken.map((company) => <li key={company.id}><Link href={`/admin/companies/${company.id}`}>{companyLabel(company)}<Icon name="arrow-right" className="size-3" /></Link></li>)}</ul> : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="template-section-heading">
        <div><h2>Let your type do the talking</h2><p>Select a font to preview it instantly. Choose a company to save that font in its editor.</p></div>
      </div>
      <label className="mb-5 block max-w-md text-sm font-semibold" htmlFor="font-company">Company for font settings
        <select id="font-company" className="field mt-2" value={companyId} disabled={!loaded || !!error} onChange={(event) => setCompanyId(event.target.value)}>
          <option value="">Choose a company or branch</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{companyLabel(company)}</option>)}
        </select>
      </label>
      <div className="mb-5 flex flex-wrap items-center gap-3" role="status">
        <span className="text-sm">Selected: <strong>{FONTS.find((font) => font.key === selectedFont)?.label}</strong></span>
        {companyId ? <Link className="btn btn-primary text-sm" href={`/admin/companies/${companyId}?tab=branding&font=${selectedFont}#company-font`}>Configure selected font<Icon name="arrow-right" className="size-4" /></Link> : <span className="text-xs text-ink-soft">Choose a company above to apply your selection.</span>}
      </div>
      <div className="template-font-grid">
        {FONTS.map((font) => (
          <section key={font.key} className={`template-font-card type-${font.key} ${selectedFont === font.key ? "is-selected" : ""}`}>
            <button type="button" className="template-font-select" aria-label={`Select ${font.label} font`} aria-pressed={selectedFont === font.key} onClick={() => setSelectedFont(font.key)}>
            <div className="template-font-top"><h3>{font.label}</h3><span aria-hidden="true">Aa</span></div>
            <p className="template-font-sample">A memorable first impression.</p>
            <p className="template-font-hint">{font.hint}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold">{selectedFont === font.key ? <><Icon name="check" className="size-4" />Selected</> : "Select font"}</span>
            </button>
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {companies.filter((company) => (company.font ?? "poppins") === font.key).map((company) => <li key={company.id}><Link href={`/admin/companies/${company.id}`} className="chip hover:text-ink">{companyLabel(company)}</Link></li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
