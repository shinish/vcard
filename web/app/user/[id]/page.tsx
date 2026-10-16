import { notFound } from "next/navigation";
import { splitDial } from "../../lib/countries";

import CardActions, { type Action } from "../../components/CardActions";
import CardLanguage from "../../components/CardLanguage";
import CardShare from "../../components/CardShare";
import ExchangeContact from "../../components/ExchangeContact";
import { Icon, type IconName, SocialMark, socialOf } from "../../components/icons";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  type Language,
  fieldLabel,
  isRtl,
  t,
} from "../../lib/i18n";
import {
  API,
  type AddressValue,
  type Contact,
  type ContactField,
  companyLabel,
  fullName,
  getPublicCard,
  paletteStyle,
} from "../../lib/api";

type Row = {
  kind: ContactField["kind"];
  label: string;
  value: string;
  href?: string;
  icon: IconName;
  lat?: number | null;
  lon?: number | null;
};

const ICONS: Record<ContactField["kind"], IconName> = {
  phone: "phone",
  email: "mail",
  url: "globe",
  address: "pin",
  date: "calendar",
  social: "link",
  im: "chat",
  relation: "user",
};

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function toRow(field: ContactField): Row | null {
  const { kind, label } = field;
  const icon = ICONS[kind];
  if (kind === "address") {
    const parts = field.value as AddressValue;
    const text = [parts.street, parts.city, parts.region, parts.postal, parts.country]
      .filter(Boolean)
      .join(", ");
    if (!text) return null;
    return {
      kind,
      label,
      icon,
      value: text,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`,
      lat: parts.lat ?? null,
      lon: parts.lon ?? null,
    };
  }
  const value = String(field.value ?? "").trim();
  if (!value) return null;
  switch (kind) {
    case "phone":
      if (!/\d/.test(splitDial(value).rest)) return null;
      return { kind, label, icon, value, href: `tel:${value.replace(/\s+/g, "")}` };
    case "email":
      return { kind, label, icon, value, href: `mailto:${value}` };
    case "url":
    case "social":
    case "im":
      return {
        kind,
        label,
        icon,
        value: value.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
        href: withProtocol(value),
      };
    default:
      return { kind, label, icon, value };
  }
}

function initials(card: Contact): string {
  return [card.first_name, card.last_name]
    .filter(Boolean)
    .map((p) => p![0]!.toUpperCase())
    .join("");
}

/** YouTube and Vimeo links become players; anything else stays a link out. */
function embedOf(url: string): string | null {
  const youtube = url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/i);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const card = await getPublicCard((await params).id);
  if (!card) return { title: "No card at this link" };
  const name = fullName(card);
  const description =
    [card.job_title, card.org || companyLabel(card.company)].filter(Boolean).join(", ") ||
    `Contact card for ${name}`;
  return {
    title: name,
    description,
    // A contact card is for the person holding the link, not for a search
    // index. Companies that want to be found can switch it on.
    robots: card.company.allow_indexing
      ? { index: true, follow: true }
      : { index: false, follow: false },
    icons: card.company.favicon_url ? { icon: card.company.favicon_url } : undefined,
    openGraph: { title: name, description, type: "profile" },
  };
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; s?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const card = await getPublicCard(id, query.s);
  if (!card) notFound();

  const name = fullName(card);
  const rows = card.fields.map(toRow).filter((r): r is Row => r !== null);
  const {
    theme,
    accents,
    logo_url: logoUrl,
    logo_position: logoAt,
    logo_scale: logoScale,
    language,
    font,
    wallpaper_url: wallpaperUrl,
    wallpaper_fit: wallpaperFit,
    show_qr: showQr,
    show_qr_download: showQrDownload,
    allow_save: allowSave,
    require_consent: requireConsent,
    show_name: showName,
    show_branch: showBranch,
    share_message: shareMessage,
    allow_exchange: allowExchange,
    media,
  } = card.company;

  // The viewer's pick wins over the company's default, so one card can be
  // read in any of the languages it is translated into.
  const picked = LANGUAGES.find((l) => l.code === query.lang)?.code;
  const lang: Language = (picked ?? language ?? DEFAULT_LANGUAGE) as Language;
  const words = t(lang);
  const rtl = isRtl(lang);

  const mapped = rows.find((r) => r.lat != null && r.lon != null);
  const socials = rows.filter((r) => r.kind === "social" || r.kind === "im");
  const details = rows.filter((r) => r.kind !== "social" && r.kind !== "im");

  // The four things someone most often wants, taken from what the card holds.
  const phone = rows.find((r) => r.kind === "phone");
  const email = rows.find((r) => r.kind === "email");
  const site = rows.find((r) => r.kind === "url");
  const actions: Action[] = [
    phone && { kind: "call", href: phone.href!, label: words.call, icon: "phone" as IconName },
    email && { kind: "email", href: email.href!, label: words.sendEmail, icon: "mail" as IconName },
    site && { kind: "website", href: site.href!, label: words.visitWebsite, icon: "globe" as IconName },
    mapped && {
      kind: "map",
      href: mapped.href!,
      label: words.directions,
      icon: "pin" as IconName,
    },
  ].filter(Boolean) as Action[];

  const logoBand = logoUrl && logoAt.startsWith("top");
  const logoFoot = logoUrl && logoAt.startsWith("bottom");
  const logoSide = logoUrl && logoAt.startsWith("middle");
  const align =
    logoAt.endsWith("left") ? "justify-start" : logoAt.endsWith("right") ? "justify-end" : "justify-center";
  const logoHeight = `${(44 * (logoScale ?? 100)) / 100}px`;

  return (
    <main
      lang={lang}
      dir={rtl ? "rtl" : "ltr"}
      className={[
        "card-page",
        `tpl-${theme}`,
        `type-${font ?? "poppins"}`,
        wallpaperFit === "stretch" ? "fit-stretch" : wallpaperFit === "tile" ? "fit-tile" : "",
        // Edge to edge on a phone or tablet; a floating card from laptops up.
        "flex min-h-dvh justify-center lg:items-center lg:p-10",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...paletteStyle(accents),
        ...(wallpaperUrl ? ({ "--wallpaper": `url(${API}${wallpaperUrl})` } as React.CSSProperties) : {}),
      }}
    >
      <article className="contact-card relative flex w-full flex-col bg-paper lg:max-w-lg lg:rounded-2xl lg:shadow-[var(--shadow-lift)]">
        {/* Header band: the company's colours — or its own picture as a cover —
            with the bar that shares or prints the card, and the logo on a line
            of its own so a centred logo is centred on the band and not in
            whatever room the bar leaves it. */}
        <header
          className={`accent-band px-6 pb-20 pt-5 text-white lg:rounded-t-2xl${
            wallpaperUrl ? " has-cover" : ""
          }`}
          style={
            wallpaperUrl
              ? ({ "--cover": `url(${API}${wallpaperUrl})` } as React.CSSProperties)
              : undefined
          }
        >
          <div className="no-print flex items-center justify-between gap-3">
            <CardShare
              publicId={card.public_id}
              shareUrl={`/user/${card.public_id}`}
              qrUrl={`${API}/api/public/${card.public_id}/qr.png`}
              shareLabel={words.share}
              copiedLabel={words.linkCopied}
              pdfLabel={words.savePdf}
              shareMessage={shareMessage}
            />
            <CardLanguage current={lang} label={words.chooseLanguage} />
          </div>
          {logoBand ? (
            <div className={`mt-4 flex ${align}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
              <img
                src={`${API}${logoUrl}`}
                alt={card.company.name}
                style={{ height: logoHeight }}
                className="w-auto max-w-[60%] object-contain"
              />
            </div>
          ) : null}
        </header>

        {logoSide ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 flex items-center ${
              logoAt === "middle-left" ? "start-3" : "end-3"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
            <img
              src={`${API}${logoUrl}`}
              alt=""
              style={{ height: logoHeight }}
              className="w-auto max-w-20 object-contain opacity-90"
            />
          </div>
        ) : null}

        <div className="relative z-10 -mt-16 flex flex-1 flex-col gap-7 px-6 pb-10">
          {/* Who this is: the photo at the size a face needs, then the name,
              the job title and the company, aligned to the margin. */}
          <section className="text-start">
            {card.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- served pre-sized by the API
              <img
                src={`${API}${card.photo_url}`}
                alt={name}
                width={160}
                height={160}
                className="size-36 shrink-0 rounded-lg border-4 border-paper object-cover object-center shadow-[var(--shadow-soft)]"
              />
            ) : (
              <p
                aria-hidden="true"
                className="flex size-36 shrink-0 items-center justify-center rounded-lg border-4 border-paper bg-wash font-display text-4xl text-ink-soft shadow-[var(--shadow-soft)]"
              >
                {initials(card)}
              </p>
            )}

            <h1 className="mt-4 font-display text-[2rem] font-bold leading-tight">{name}</h1>
            {card.job_title ? (
              <p className="mt-1 text-[0.95rem] font-semibold text-ink-soft">{card.job_title}</p>
            ) : null}
            {card.org || (showName && card.company.name) ? (
              <p className="mt-0.5 text-base font-semibold text-ink">
                {card.org || card.company.name}
              </p>
            ) : null}
            {showBranch && card.company.branch ? (
              <p className="mt-1 text-xs text-ink-soft">{card.company.branch}</p>
            ) : null}
            <span aria-hidden="true" className="accent-rule me-auto mt-4 block h-1 w-12 rounded-full" />
          </section>

          <CardActions
            publicId={card.public_id}
            vcfUrl={`${API}${card.vcf_url}`}
            actions={actions}
            saveLabel={words.saveContact}
            doneLabel={words.downloaded(card.first_name ?? name)}
            allowSave={allowSave}
            requireConsent={requireConsent}
            consentLabel={words.consent}
          />

          {allowExchange ? (
            <ExchangeContact
              publicId={card.public_id}
              title={words.exchange}
              intro={words.exchangeIntro}
              nameLabel={words.yourName}
              emailLabel={words.yourEmail}
              phoneLabel={words.yourPhone}
              messageLabel={words.yourMessage}
              sendLabel={words.sendDetails}
              sendingLabel={words.sending}
              sentLabel={words.exchangeSent}
              failedLabel={words.exchangeFailed}
            />
          ) : null}

          {allowSave ? null : (
            <p className="text-center text-xs text-ink-soft">{words.savingOff}</p>
          )}

          {card.note ? (
            <section>
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                {words.about}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{card.note}</p>
            </section>
          ) : null}

          {socials.length ? (
            <section>
              <ul className="flex flex-wrap gap-2.5">
                {socials.map((row, i) => {
                  const mark = socialOf(row.label, row.value);
                  return (
                    <li key={`${row.label}-${i}`}>
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noreferrer"
                        title={`${row.label}: ${row.value}`}
                        className="flex size-11 items-center justify-center rounded-full bg-ink text-white hover:bg-brand hover:text-ink"
                      >
                        <SocialMark name={mark} />
                        <span className="sr-only">{row.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {details.length ? (
            <section>
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                {words.details}
              </h2>
              <ul className="mt-2 divide-y divide-line">
                {details.map((row, i) => {
                  const inner = (
                    <>
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-wash text-brand-ink">
                        <Icon name={row.icon} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold">{row.value}</span>
                        <span className="block text-xs text-ink-soft">
                          {fieldLabel(lang, row.label)}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${row.label}-${i}`}>
                      {row.href ? (
                        <a href={row.href} className="flex items-start gap-3 py-3 hover:text-brand-ink">
                          {inner}
                        </a>
                      ) : (
                        <p className="flex items-start gap-3 py-3">{inner}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {media.length ? (
            <section>
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-ink-soft">
                {words.showcase}
              </h2>
              <ul className="mt-3 space-y-3">
                {media.map((item) => {
                  const embed = item.kind === "video" && item.url ? embedOf(item.url) : null;
                  return (
                    <li key={item.id} className="overflow-hidden rounded-xl border border-line">
                      {embed ? (
                        <iframe
                          src={embed}
                          title={item.caption ?? words.watch}
                          loading="lazy"
                          allowFullScreen
                          className="aspect-video w-full"
                        />
                      ) : item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served by the API
                        <img
                          src={`${API}${item.image_url}`}
                          alt={item.caption ?? ""}
                          loading="lazy"
                          className="w-full object-cover"
                        />
                      ) : item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-3 text-sm font-semibold text-brand-ink"
                        >
                          <Icon name="play" className="size-4" />
                          {item.caption ?? words.watch}
                        </a>
                      ) : null}
                      {item.caption && (embed || item.image_url) ? (
                        <p className="px-3 py-2 text-xs text-ink-soft">{item.caption}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {mapped ? (
            <figure>
              {/* OpenStreetMap's own embed: free, no key, no account. It does mean
                  the viewer's browser contacts openstreetmap.org. */}
              <iframe
                title={words.mapOf(mapped.value)}
                loading="lazy"
                className="h-48 w-full rounded-xl border border-line"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                  (mapped.lon as number) - 0.004
                }%2C${(mapped.lat as number) - 0.0025}%2C${
                  (mapped.lon as number) + 0.004
                }%2C${(mapped.lat as number) + 0.0025}&layer=mapnik&marker=${mapped.lat}%2C${mapped.lon}`}
              />
              <figcaption className="mt-2 text-center text-xs">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${mapped.lat}&mlon=${mapped.lon}#map=17/${mapped.lat}/${mapped.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-brand-ink underline"
                >
                  {words.openMap}
                </a>
              </figcaption>
            </figure>
          ) : null}

          {showQr ? (
            <section className="rounded-xl border border-line bg-wash p-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from the API */}
              <img
                src={`${API}${card.qr_url}`}
                alt={words.qrAlt(name)}
                width={132}
                height={132}
                className="mx-auto size-33 rounded-lg bg-paper p-2"
              />
              <p className="mt-3 text-xs text-ink-soft">{words.scanToOpen}</p>
              {showQrDownload ? (
                <a
                  href={`${API}/api/public/${id}/qr.png`}
                  download
                  className="btn mt-3 bg-paper text-xs"
                >
                  <Icon name="download" className="size-3.5" />
                  {words.downloadQr}
                </a>
              ) : null}
            </section>
          ) : null}

          {logoFoot ? (
            <div className={`flex ${align}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
              <img
                src={`${API}${logoUrl}`}
                alt={card.company.name}
                style={{ height: logoHeight }}
                className="w-auto max-w-[55%] object-contain"
              />
            </div>
          ) : null}

          <p className="mt-auto pt-2 text-center text-[11px] text-ink-soft">
            TrueTap · truestar business solution
          </p>
        </div>
      </article>
    </main>
  );
}
