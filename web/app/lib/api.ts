import type { Language } from "./i18n";

// Browser requests are same-origin and get proxied by the Next rewrite, so
// this is deliberately empty: "/api/..." is already the right URL.
export const API = "";

// Server components cannot use a relative URL, so they call the backend direct.
const SERVER_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

/** Repeatable field kinds, matching the backend allow-list. */
export const KINDS = [
  "phone",
  "email",
  "url",
  "address",
  "date",
  "social",
  "im",
  "relation",
] as const;
export type Kind = (typeof KINDS)[number];

export const LABELS: Record<Kind, string[]> = {
  phone: ["mobile", "iPhone", "home", "work", "main", "home fax", "work fax", "pager", "other"],
  email: ["home", "work", "iCloud", "school", "other"],
  url: ["homepage", "home", "work", "blog", "other"],
  address: ["home", "work", "other"],
  date: ["birthday", "anniversary", "other"],
  social: ["Twitter", "Facebook", "LinkedIn", "Instagram", "YouTube", "GitHub"],
  im: ["WhatsApp", "Skype", "Telegram", "Signal", "Slack"],
  relation: ["spouse", "partner", "child", "mother", "father", "assistant", "manager"],
};

export const ADDRESS_PARTS = ["street", "city", "region", "postal", "country"] as const;
export type AddressValue = Record<(typeof ADDRESS_PARTS)[number], string> & {
  /** Present only when the address came from the geocoder. */
  lat?: number | null;
  lon?: number | null;
};

export const SINGLE_FIELDS = [
  "prefix",
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "nickname",
  "phonetic_first",
  "phonetic_last",
  "org",
  "department",
  "job_title",
  "note",
] as const;
export type SingleField = (typeof SINGLE_FIELDS)[number];

export type ContactField = { kind: Kind; label: string; value: string | AddressValue };

/** A picture, video or link button a company shows on every card it owns.
 *
 *  All three are one list in one order. A link reads `caption` as its label
 *  and `image_url` as the picture inside it; `fill` and `border` are how it
 *  is drawn, and only a link looks at them. */
export type Media = {
  id: number;
  kind: "image" | "video" | "link";
  caption: string | null;
  url: string | null;
  image_url: string | null;
  fill: boolean;
  border: number;
};

export type Contact = Record<SingleField, string | null> & {
  public_id: string;
  fields: ContactField[];
  photo_url: string | null;
  vcf_url: string;
  qr_url: string;
  company: {
    name: string;
    branch: string | null;
    slug: string;
    theme: ThemeKey;
    accents: string[];
    logo_url: string | null;
    logo_position: LogoPosition;
    logo_scale: number;
    language: Language;
    font: FontKey;
  type_scale: TypeScaleKey;
  cover_url: string | null;
  card_bg_url: string | null;
  photo_shape: PhotoShape;
  photo_align: PhotoAlign;
  photo_size: PhotoSize;
  icon_colour: string | null;
  footer_rule: string | null;
    wallpaper_url: string | null;
    wallpaper_fit: WallpaperFit;
    show_qr: boolean;
    show_qr_download: boolean;
    favicon_url: string | null;
    require_consent: boolean;
    allow_save: boolean;
    allow_indexing: boolean;
    show_name: boolean;
    show_branch: boolean;
    share_message: string | null;
    allow_exchange: boolean;
    media: Media[];
  };
};

/** Background templates, matching the backend allow-list. */
export const THEMES = [
  { key: "plain", label: "Minimal", hint: "Clean and professional" },
  { key: "corporate", label: "Corporate", hint: "Modern business style" },
  { key: "ink", label: "Executive", hint: "Dark premium design" },
  { key: "gradient", label: "Gradient", hint: "Modern and vibrant" },
  { key: "glass", label: "Glass", hint: "Frosted modern look" },
  { key: "luxury", label: "Luxury", hint: "Elegant and refined" },
  { key: "creative", label: "Creative", hint: "Bold and unique" },
  { key: "grid", label: "Tech", hint: "Futuristic design" },
  { key: "wallpaper", label: "Custom", hint: "A picture you upload" },
  { key: "dots", label: "Halftone", hint: "A printer's dot texture" },
  { key: "topo", label: "Contour", hint: "Height lines off a map" },
  { key: "stripes", label: "Bands", hint: "Wide diagonal stripes, both your colours" },
  { key: "aurora", label: "Aurora", hint: "Dark, with colour low on the sky" },
  { key: "blueprint", label: "Blueprint", hint: "Drafting paper and fine rules" },
  { key: "carbon", label: "Carbon", hint: "Dark woven fibre" },
  { key: "linen", label: "Linen", hint: "Warm paper with a tooth" },
  { key: "horizon", label: "Horizon", hint: "A banded sky in your colour" },
  { key: "noir", label: "Noir", hint: "Greyscale, so the logo carries the colour" },
  { key: "terrazzo", label: "Terrazzo", hint: "Chips of colour in pale stone" },
  { key: "neon", label: "Neon", hint: "A dark grid lit from two corners" },
  { key: "arc", label: "Arc", hint: "Rings swung out of a corner" },
  // Offered before the set above was named; still valid, so a company that
  // picked one keeps it rather than being quietly moved.
  { key: "rays", label: "Rays", hint: "Accent glow with soft rays" },
  { key: "solid", label: "Solid", hint: "One flat colour, yours" },
] as const;

/** The ones the picker shows. The two legacy keys after them stay selectable
 *  only for whoever is already on one. */
export const OFFERED_THEMES = THEMES.slice(0, 21);

/** How an uploaded wallpaper fills the screen. */
export const WALLPAPER_FITS = [
  { key: "cover", label: "Fill", hint: "Covers the screen, crops the edges" },
  { key: "stretch", label: "Stretch", hint: "Fits exactly, may distort" },
  { key: "tile", label: "Tile", hint: "Repeats a pattern" },
] as const;
export type WallpaperFit = (typeof WALLPAPER_FITS)[number]["key"];
export const DEFAULT_WALLPAPER_FIT: WallpaperFit = "cover";

/** Type sets a company can pick for its cards. */
export const FONTS = [
  { key: "poppins", label: "Poppins & Nunito", hint: "The house pairing" },
  { key: "inter", label: "Inter", hint: "Neutral and modern" },
  { key: "playfair", label: "Playfair & Lato", hint: "Serif headings" },
  { key: "plex", label: "IBM Plex Sans", hint: "Technical, even widths" },
  { key: "cairo", label: "Cairo", hint: "Carries Arabic properly" },
  { key: "lato", label: "Lato", hint: "Quiet and humanist" },
  { key: "nunito", label: "Nunito", hint: "Rounded, approachable" },
  { key: "raleway", label: "Raleway Light", hint: "Thin, for an airy card" },
  { key: "montserrat", label: "Montserrat", hint: "Geometric and broad" },
  { key: "lora", label: "Lora", hint: "A softer serif" },
  { key: "manrope", label: "Manrope", hint: "Modern, slightly squared" },
  { key: "oswald", label: "Oswald", hint: "Condensed, for short names" },
  { key: "quicksand", label: "Quicksand", hint: "Rounded and friendly" },
] as const;
export type FontKey = (typeof FONTS)[number]["key"];

/** How large the card reads. A zoom on the card itself, because the type
 *  sizes are in rem and resolve against the root rather than the card. */
export const TYPE_SCALES = [
  { key: "compact", label: "Compact" },
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
  { key: "xl", label: "Extra large" },
] as const;
export type TypeScaleKey = (typeof TYPE_SCALES)[number]["key"];
export const DEFAULT_TYPE_SCALE: TypeScaleKey = "normal";

/** The card holder's photo: how it is cut, where it sits, how large it runs. */
export const PHOTO_SHAPES = [
  { key: "square", label: "Square" },
  { key: "circle", label: "Circle" },
] as const;
export type PhotoShape = (typeof PHOTO_SHAPES)[number]["key"];

export const PHOTO_ALIGNS = [
  { key: "left", label: "Left" },
  { key: "center", label: "Centre" },
  { key: "right", label: "Right" },
] as const;
export type PhotoAlign = (typeof PHOTO_ALIGNS)[number]["key"];

export const PHOTO_SIZES = [
  { key: "small", label: "Small" },
  { key: "medium", label: "Medium" },
  { key: "large", label: "Large" },
] as const;
export type PhotoSize = (typeof PHOTO_SIZES)[number]["key"];
export const DEFAULT_FONT: FontKey = "poppins";

export type ThemeKey = (typeof THEMES)[number]["key"];
export const DEFAULT_ACCENT = "#28b4be";

/** The eight edge and corner slots of a 3x3 grid; the centre holds the card. */
export const LOGO_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];
export const DEFAULT_LOGO_POSITION: LogoPosition = "top-center";
export const MIN_LOGO_SCALE = 50;
export const MAX_LOGO_SCALE = 400;
export const DEFAULT_LOGO_SCALE = 100;

/** Grid placement classes for each slot. */
export const LOGO_PLACEMENT: Record<LogoPosition, string> = {
  "top-left": "col-start-1 row-start-1 justify-self-start self-start",
  "top-center": "col-start-2 row-start-1 justify-self-center self-start",
  "top-right": "col-start-3 row-start-1 justify-self-end self-start",
  "middle-left": "col-start-1 row-start-2 justify-self-start self-center",
  "middle-right": "col-start-3 row-start-2 justify-self-end self-center",
  "bottom-left": "col-start-1 row-start-3 justify-self-start self-end",
  "bottom-center": "col-start-2 row-start-3 justify-self-center self-end",
  "bottom-right": "col-start-3 row-start-3 justify-self-end self-end",
};
export const MAX_ACCENTS = 6;

/** Map a company palette onto the CSS variables the templates read. */
export function paletteStyle(accents: string[] | null | undefined) {
  const list = accents?.length ? accents : [DEFAULT_ACCENT];
  return {
    "--accent": list[0],
    "--accent-2": list[1] ?? "#071012",
    "--accent-3": list[2] ?? list[1] ?? list[0],
  } as React.CSSProperties;
}

export const COMPANY_DETAILS = [
  "about",
  "phone",
  "email",
  "website",
  "street",
  "city",
  "region",
  "postal",
  "country",
] as const;

export type Company = {
  id: number;
  name: string;
  /** Empty when the company has only one location. */
  branch: string;
  slug: string;
  contact_count: number;
  theme: ThemeKey;
  accents: string[];
  logo_path: string | null;
  logo_position: LogoPosition;
  logo_scale: number;
  language: Language;
  font: FontKey;
  type_scale: TypeScaleKey;
  cover_url: string | null;
  card_bg_url: string | null;
  photo_shape: PhotoShape;
  photo_align: PhotoAlign;
  photo_size: PhotoSize;
  icon_colour: string | null;
  footer_rule: string | null;
  wallpaper_path: string | null;
  cover_path: string | null;
  card_bg_path: string | null;
  wallpaper_fit: WallpaperFit;
  show_qr: boolean | number;
  show_qr_download: boolean | number;
  favicon_path: string | null;
  photo_path: string | null;
  photo_small_path: string | null;
  require_consent: boolean | number;
  public_sharing: boolean | number;
  allow_indexing: boolean | number;
  allow_save: boolean | number;
  show_company_name: boolean | number;
  show_branch: boolean | number;
  share_message: string | null;
  notify_to: string | null;
  notify_created: boolean | number;
  notify_updated: boolean | number;
  updated_at: string | null;
} & Partial<Record<(typeof COMPANY_DETAILS)[number], string | null>>;

/** The company switches, with the wording the admin reads. */
export const COMPANY_SWITCHES = [
  {
    key: "public_sharing" as const,
    label: "Public sharing",
    hint: "Off takes every card in this company offline: the links stop working.",
  },
  {
    key: "allow_save" as const,
    label: "Allow save to contacts",
    hint: "Off hides the save button and refuses the contact file.",
  },
  {
    key: "require_consent" as const,
    label: "Ask before saving",
    hint: "The card asks the visitor to agree before it hands over the contact file.",
  },
  {
    key: "allow_indexing" as const,
    label: "Allow search engines",
    hint: "Off keeps these cards out of Google. Off is the usual answer.",
  },
  {
    key: "show_company_name" as const,
    label: "Show company name",
    hint: "Print the company name on every card in this company.",
  },
  {
    key: "show_branch" as const,
    label: "Show branch name",
    hint: "Print the branch under the company name.",
  },
];

/** Every admin spans every company, so there is no role or company here. */
export type Me = { email: string; name: string | null; photo_url?: string | null };

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  disabled: boolean;
  created_at: string;
};

export type Dashboard = {
  totals: {
    companies: number;
    contacts: number;
    admins: number;
    views: number;
    saves: number;
  };
  busiest: {
    id: number;
    first_name: string;
    last_name: string | null;
    company: string;
    branch: string;
    views: number;
  }[];
  companies: {
    id: number;
    name: string;
    branch: string;
    city: string | null;
    country: string | null;
    contact_count: number;
  }[];
  recent: {
    email: string | null;
    photo_url: string | null;
    id: number;
    public_id: string;
    first_name: string;
    last_name: string | null;
    job_title: string | null;
    company: string;
    branch: string;
    company_id: number;
    updated_at: string;
  }[];
};

/** Every admin call carries the session cookie. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, { ...init, credentials: "same-origin" });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await api(path, init);
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getPublicCard(
  id: string,
  source?: string,
  /** An admin's cookies, when this render is the designer's preview. The API
   *  leaves a preview out of the visit counts, but only for a session it can
   *  verify — so the cookies have to travel with the request. */
  previewAs?: string,
): Promise<Contact | null> {
  const base = typeof window === "undefined" ? SERVER_ORIGIN : "";
  const params = new URLSearchParams();
  if (source) params.set("s", source);
  if (previewAs) params.set("preview", "1");
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${base}/api/public/${encodeURIComponent(id)}${query}`, {
    cache: "no-store",
    ...(previewAs ? { headers: { cookie: previewAs } } : {}),
  });
  // 410 is a card whose company switched sharing off: the link was real, and
  // the page it lands on says the same thing either way.
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`Could not load card ${id}: ${res.status}`);
  return res.json();
}

export function fullName(c: {
  prefix?: string | null;
  first_name: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
}): string {
  return [c.prefix, c.first_name, c.middle_name, c.last_name, c.suffix]
    .filter(Boolean)
    .join(" ");
}

/** "Acme Ltd — Muscat", or just "Acme Ltd" when there is only one location. */
export function companyLabel(c: { name: string; branch?: string | null }): string {
  return c.branch ? `${c.name} — ${c.branch}` : c.name;
}

/** What one window of card_events looks like, for an admin or a card holder. */
export type Analytics = {
  days: number;
  grain: "day" | "week" | "month";
  from: string;
  to: string;
  totals: {
    views: number;
    clicks: number;
    saves: number;
    shares: number;
    active_cards: number;
    cards: number;
    visitors: number;
    new_cards: number;
  };
  change: Record<
    "views" | "clicks" | "saves" | "shares" | "visitors" | "active_cards" | "new_cards",
    number | null
  >;
  series: {
    day: string;
    views: number;
    clicks: number;
    saves: number;
    shares: number;
    new_cards: number;
  }[];
  actions: { kind: string; n: number; change: number | null }[];
  sources: { source: string; n: number }[];
  devices: { device: string; n: number }[];
  top: {
    id: number;
    public_id: string;
    first_name: string;
    last_name: string | null;
    job_title: string | null;
    company: string;
    branch: string;
    views: number;
    clicks: number;
    saves: number;
    photo_url: string | null;
    change: { views: number | null; clicks: number | null; saves: number | null };
  }[];
};

/** A tint per event kind, for the rows that name them. */
export const EVENT_TINTS: Record<string, string> = {
  call: "#1aa260",
  email: "#2f8ad6",
  website: "#5b6b7f",
  map: "#dc2626",
  share: "#0a66c2",
  save: "#15365c",
  qr: "#0b1b2b",
  signature: "#7c3aed",
  view: "#2f8ad6",
};

/** The longest default sharing message the API will take. */
export const MAX_SHARE_MESSAGE = 200;

/** Windows the analytics API accepts; anything else is a 422. */
export const ANALYTICS_DAYS = [7, 30, 90, 365] as const;

/** Plain words for the event kinds the card records. */
export const EVENT_LABELS: Record<string, string> = {
  view: "Card opened",
  save: "Saved to contacts",
  qr: "QR code",
  signature: "Email signature",
  call: "Phone call",
  email: "Email",
  website: "Website",
  map: "Map or directions",
  share: "Shared",
};
