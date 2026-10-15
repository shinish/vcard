import Link from "next/link";

import CopyLink from "./CopyLink";

export type Summary = { term: string; detail: string }[];

/** Either a link elsewhere, or an action that clears this panel. A Link to the
 *  route you are already on does not remount the page, so "Add another" has to
 *  reset state rather than navigate. */
export type Action = { text: string; href?: string; onClick?: () => void };

/** Shown after a record is created: what was made, and the link to hand over. */
const PRIMARY =
  "grad-brand px-5 py-2.5 font-display text-sm font-semibold text-ink hover:opacity-90";
const SECONDARY =
  "border border-ink px-5 py-2.5 font-display text-sm font-semibold hover:bg-ink hover:text-white";

function renderAction(action: Action, className: string) {
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.text}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.text}
    </button>
  );
}

export default function CreatedPanel({
  heading,
  summary,
  links,
  primary,
  secondary,
  extras,
  children,
}: {
  heading: string;
  summary: Summary;
  links: { label: string; value: string }[];
  primary?: Action;
  secondary?: Action;
  extras?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="max-w-2xl border border-line bg-paper p-7">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-1 block size-2.5 shrink-0 grad-brand" />
        <h1 className="font-display text-2xl font-bold">{heading}</h1>
      </div>

      <dl className="mt-6 border-t border-line">
        {summary.map((item) => (
          <div key={item.term} className="flex gap-4 border-b border-line py-2.5 text-sm">
            <dt className="w-36 shrink-0 text-ink-soft">{item.term}</dt>
            <dd className="min-w-0 break-words font-semibold">{item.detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 space-y-5">
        {links.map((link) => (
          <CopyLink key={link.label} label={link.label} value={link.value} />
        ))}
      </div>

      {extras ? <div className="mt-5">{extras}</div> : null}

      {children}

      <div className="mt-7 flex flex-wrap gap-3">
        {primary ? renderAction(primary, PRIMARY) : null}
        {secondary ? renderAction(secondary, SECONDARY) : null}
      </div>
    </section>
  );
}
