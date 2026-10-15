"use client";

import Link from "next/link";
import { useState } from "react";

const SECTIONS = [
  {
    q: "How do I give someone a contact card?",
    a: [
      "Open Companies, choose the company or branch they belong to, then Add a person.",
      "The branch's phone, email, website and address fill in automatically. Change anything that differs for them, add their mobile, and save.",
      "You get a share link straight away, with a Copy button and a QR code to download.",
    ],
  },
  {
    q: "What does the person on the other end see?",
    a: [
      "The share link opens a card with no sign-in — anyone can view it.",
      "Tapping Save contact downloads a .vcf file. Opening that adds the person to the phone's address book, photo included.",
      "The link never changes, so editing a card updates it for everyone who already has it.",
    ],
  },
  {
    q: "A company has more than one office",
    a: [
      "Add each office as its own branch using the same company name and a different branch label, such as Muscat and Salalah.",
      "Each branch keeps its own address, phone and look, so a card picks up the right details for where that person works.",
    ],
  },
  {
    q: "Changing how the cards look",
    a: [
      "On a company page, open Logo and background under Change.",
      "Pick one of five background templates, add up to six colours, upload a logo and choose which of eight positions it sits in.",
      "Changing a company's look does not rewrite cards that already exist — their details were copied when they were made.",
    ],
  },
  {
    q: "Using a card in an Outlook signature",
    a: [
      "Every card has a ready-made signature with the person's details, a link to the card and a QR code.",
      "Open the person's row, choose Outlook signature, then copy it and paste into Outlook's signature editor.",
      "Outlook fetches the logo and QR from this server, so they only appear while it is reachable from wherever the mail is read.",
    ],
  },
  {
    q: "Administrators",
    a: [
      "Every administrator can see and change every company. There is no per-company login.",
      "Administrators can reset each other's passwords, disable an account, or delete one.",
      "You cannot disable or delete your own account, and the last enabled administrator is protected — otherwise nobody could get back in.",
    ],
  },
  {
    q: "Something is not working",
    a: [
      "Address search comes from OpenStreetMap and does not know every street. If nothing is found, type the address in by hand — the fields always work.",
      "If the Copy button does nothing, the page is on plain http where the browser blocks the clipboard. The text is selected for you; press Cmd+C or Ctrl+C.",
      "If a card will not open, check the link was copied whole — the id is 22 characters and case-sensitive.",
    ],
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold">Help</h1>
        <p className="mt-1 text-sm text-ink-soft">
          How the parts fit together, and what to do when something looks wrong.
        </p>
      </header>

      <div className="max-w-2xl divide-y divide-line border border-line bg-paper">
        {SECTIONS.map((section, i) => (
          <article key={section.q}>
            <h2>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display font-semibold hover:text-brand-ink"
              >
                {section.q}
                <span aria-hidden="true" className="shrink-0 text-ink-soft">
                  {open === i ? "–" : "+"}
                </span>
              </button>
            </h2>
            {open === i ? (
              <div className="space-y-2 px-5 pb-5 text-sm text-ink-soft">
                {section.a.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <p className="mt-6 max-w-2xl text-sm text-ink-soft">
        Still stuck? Start from <Link href="/admin/companies" className="text-brand-ink underline">Companies</Link>{" "}
        — nearly everything hangs off a company.
      </p>
    </>
  );
}
