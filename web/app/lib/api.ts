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

/** A picture or video a company shows on every card it owns. */
export type Media = {
  id: number;
  kind: "image" | "video";
  caption: string | null;
  url: string | null;
  image_url: string | null;
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
  // Offered before the set above was named; still valid, so a company that
  // picked one keeps it rather than being quietly moved.
  { key: "rays", label: "Rays", hint: "Accent glow with soft rays" },
  { key: "solid", label: "Solid", hint: "One flat colour, yours" },
] as const;

/** The nine the picker shows. The rest stay selectable only for whoever is
 *  already on one. */
export const OFFERED_THEMES = THEMES.slice(0, 9);

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
] as const;
export type FontKey = (typeof FONTS)[number]["key"];
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
export const MAX_LOGO_SCALE = 220;
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
  wallpaper_path: string | null;
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

export async function getPublicCard(id: string, source?: string): Promise<Contact | null> {
  const base = typeof window === "undefined" ? SERVER_ORIGIN : "";
  const query = source ? `?s=${encodeURIComponent(source)}` : "";
  const res = await fetch(`${base}/api/public/${encodeURIComponent(id)}${query}`, {
    cache: "no-store",
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
