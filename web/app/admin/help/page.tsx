"use client";

import Link from "next/link";
import { Icon } from "../../components/icons";
import { useState } from "react";

const SECTIONS = [
  { category: "Companies", q: "How do I add a company or another branch?", a: [
    "Open Companies and select Add company. Enter a company name and an optional branch label.",
    "Use the same company name and a different branch label for each office. Each branch has its own address, phone, branding and people.",
    "Search the directory by company, branch, location, email or phone. The sharing filter shows which branches have public sharing on or off.",
  ], href: "/admin/companies", action: "Open companies" },
  { category: "People and cards", q: "How do I create a contact card?", a: [
    "Select Add a person from People or from the company the person belongs to.",
    "Company details seed a new card. Check the company, name, job title and contact fields, then select Create contact.",
    "Use the share link, contact file or QR code on the saved contact page.",
  ], href: "/admin/contacts/new", action: "Create a contact card" },
  { category: "People and cards", q: "How do I find or edit someone?", a: [
    "Use the search box at the top of any admin page, or filter People by name, role or company.",
    "Select the person’s name or the eye icon to open the contact. Select Edit to change their details and Save changes to keep them.",
    "The shared web card updates at the same link. A contact already saved in someone’s phone does not update automatically; they need to save the contact again.",
  ], href: "/admin/people", action: "Open people" },
  { category: "Design", q: "How do I change a card’s background, colours or typography?", a: [
    "Open Card templates to explore backgrounds and type sets. Select a design to preview it; previews do not save changes.",
    "Choose a company and open its card designer, or open the company’s Card design tab directly. Choose the template and select Save changes.",
    "Use Branding to set company colours, typography and logo placement. Company branding styles its cards; changing company contact details does not overwrite existing people’s details.",
  ], href: "/admin/templates", action: "Explore templates" },
  { category: "Design", q: "How do logos, photos and the card preview work?", a: [
    "Open the company’s Overview or Branding tab to manage its images. The image editor supports cropping and adjustments before saving.",
    "Use Mobile or Desktop in the preview panel to change the preview size. Saved changes appear in the real embedded card.",
    "A company without people shows a sample card. Add a person to preview a real contact.",
  ], href: "/admin/companies", action: "Choose a company" },
  { category: "Sharing", q: "How do I share a card or save it to a phone?", a: [
    "Open a contact and copy its share link, download its QR code, or download the contact file.",
    "The public card’s Save contact button downloads a .vcf file. Open that file on the phone to review and save the contact.",
    "If public sharing is off, the public card is unavailable. A company can also disable saving or require consent before a contact file is downloaded.",
  ], href: "/admin/people", action: "Find a contact" },
  { category: "Sharing", q: "How do I use the email signature?", a: [
    "Open a contact and choose a design under Email signature. The preview changes with your selection.",
    "Open the signature, select its contents, copy them, and paste into your email application’s signature editor.",
    "Images and QR codes load from this application. The public application address must be reachable by email recipients.",
  ], href: "/admin/people", action: "Find a contact" },
  { category: "Analytics", q: "How do I filter analytics and export a report?", a: [
    "Open Analytics and choose a period, company and person. Choose a custom period to set start and end dates.",
    "Use Daily, Weekly or Monthly to group the trend chart. The report shows views, visitors, clicks, shares, card activity, actions, devices and referrers.",
    "Export report downloads a CSV. Email it uses the configured notification address and email service.",
    "Visitor locations are not collected. Visitor counts use identifiers re-salted daily, so they are not a count of distinct people across the entire period.",
  ], href: "/admin/analytics", action: "Open analytics" },
  { category: "Accounts", q: "How do administrator accounts and profiles work?", a: [
    "Administrators can manage every company. Open Administrators to manage accounts, or use the profile menu for your own details.",
    "Your profile includes password and two-step verification settings. Keep recovery codes somewhere safe when enabling two-step verification.",
    "The application protects your own account and the last enabled administrator from being disabled or deleted.",
  ], href: "/admin/profile", action: "Open your profile" },
  { category: "Accounts", q: "Can a card holder sign in to their own page?", a: [
    "Open their contact and use Their own sign-in to configure a sign-in email.",
    "Email the sign-in code when the email service is configured. The holder uses the code to set their password.",
    "The holder portal provides their card link, downloads, signature designs and their own analytics. It does not give them administrator access.",
  ], href: "/admin/people", action: "Choose a card holder" },
  { category: "Troubleshooting", q: "What should I check when a link, download or email fails?", a: [
    "Check that the whole share link was copied and that public sharing is enabled for the company. Public card IDs are case-sensitive.",
    "If clipboard copying is blocked, the link is selected so you can copy it manually. Check your browser’s download list if a contact file or QR code does not appear.",
    "Check the public application address, email service and notification address in Settings. Email delivery needs a working external service.",
    "Address lookup is optional. If search is unavailable, enter the address fields manually.",
  ], href: "/admin/settings", action: "Open settings" },
];

export default function HelpPage() {
  const [open, setOpen] = useState<string | null>(SECTIONS[0].q);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All topics");
  const categories = ["All topics", ...new Set(SECTIONS.map((section) => section.category))];
  const needle = query.trim().toLowerCase();
  const shown = SECTIONS.filter((section) =>
    (category === "All topics" || section.category === category) &&
    [section.q, section.category, ...section.a].join(" ").toLowerCase().includes(needle),
  );
  return (
    <div className="help-center">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Help</h1>
        <p className="mt-2 text-sm text-ink-soft">Find a quick answer and get back to managing your contact cards.</p>
      </header>
      <div className="help-search surface">
        <Icon name="search" className="size-5" />
        <input type="search" className="field" aria-label="Search help" placeholder="Search cards, companies, sharing, analytics…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="help-topics" aria-label="Help topics">
        {categories.map((topic) => <button type="button" key={topic} aria-pressed={category === topic} onClick={() => setCategory(topic)} className={category === topic ? "is-selected" : ""}>{topic}</button>)}
      </div>
      <div className="help-layout">
        <section className="surface overflow-hidden" aria-label="Help answers">
          <p className="help-result-count" role="status">{shown.length} {shown.length === 1 ? "answer" : "answers"}{category === "All topics" ? "" : ` in ${category}`}</p>
          {shown.length === 0 ? <div className="p-6"><h2 className="font-semibold">No matching answers</h2><p className="mt-2 text-sm text-ink-soft">Try another word or choose a different topic.</p><button type="button" className="btn mt-4" onClick={() => { setQuery(""); setCategory("All topics"); }}>Clear filters</button></div> : shown.map((section) => {
            const index = SECTIONS.indexOf(section);
            const expanded = open === section.q;
            return <article className="help-answer" key={section.q}>
              <h2><button type="button" onClick={() => setOpen(open === section.q ? null : section.q)} aria-expanded={expanded} aria-controls={`help-answer-${index}`}><span>{section.q}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button></h2>
              {expanded ? <div id={`help-answer-${index}`} className="help-answer-body">{section.a.map((line) => <p key={line}>{line}</p>)}<Link href={section.href}>{section.action}<Icon name="arrow-right" className="size-3.5" /></Link></div> : null}
            </article>;
          })}
        </section>
        <aside className="help-shortcuts surface">
          <span className="tile-icon size-10"><Icon name="help" className="size-5" /></span>
          <h2>Contact TrueTap</h2>
          <p>Need a hand? Contact our team.</p>
          <a href="tel:+96891232596"><Icon name="phone" className="size-4" />+968 91232596</a>
          <a href="tel:+96890743018"><Icon name="phone" className="size-4" />+968 90743018</a>
          <a href="mailto:info@truetap.in"><Icon name="mail" className="size-4" />info@truetap.in</a>
          <a href="https://truetap.in/" target="_blank" rel="noopener noreferrer"><Icon name="globe" className="size-4" />truetap.in</a>
          <h2 className="mt-6">Workspace shortcuts</h2>
          <p>Jump straight to the right part of your workspace.</p>
          <Link href="/admin/companies">Manage companies<Icon name="arrow-right" className="size-4" /></Link>
          <Link href="/admin/people">Find a person<Icon name="arrow-right" className="size-4" /></Link>
          <Link href="/admin/templates">Explore card designs<Icon name="arrow-right" className="size-4" /></Link>
          <Link href="/admin/analytics">View reports<Icon name="arrow-right" className="size-4" /></Link>
          <Link href="/admin/settings">Application settings<Icon name="arrow-right" className="size-4" /></Link>
        </aside>
      </div>
    </div>
  );
}