/** One small icon set, drawn as paths so there is no icon dependency and no
 *  network request. Stroke icons for actions, filled marks for the social
 *  networks whose logos people recognise at a glance. */

export type IconName =
  | "phone"
  | "mail"
  | "globe"
  | "pin"
  | "calendar"
  | "user"
  | "share"
  | "download"
  | "qr"
  | "play"
  | "chat"
  | "link"
  | "building"
  | "chart"
  | "gear"
  | "help"
  | "people"
  | "grid"
  | "plus"
  | "search"
  | "lock"
  | "eye"
  | "eye-off"
  | "shield"
  | "card"
  | "arrow-right"
  | "tap"
  | "trend-up"
  | "trend-down"
  | "check";

const STROKE: Record<IconName, string> = {
  phone: "M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z",
  mail: "M3 6.5h18v11H3zM3 7l9 6 9-6",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z",
  pin: "M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  calendar: "M4 6.5h16v14H4zM8 3v5M16 3v5M4 11h16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  share: "M14 9V4l7 8-7 8v-5c-5 0-8 1.5-10 5 .5-6 3.5-10 10-11Z",
  download: "M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19.5h16",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  chat: "M4 5.5h16v11H9l-5 4v-15Z",
  link: "M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7L12.5 18",
  building: "M4 20.5V5.5l8-2.5v17.5M12 20.5h8V10l-8-2.5M7 9h2M7 12.5h2M7 16h2M15.5 12.5h1.5M15.5 16h1.5",
  chart: "M4 20h16M7 17V9.5M12 17V5M17 17v-6",
  gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M19.4 13.5a7.8 7.8 0 0 0 0-3l1.8-1.3-2-3.4-2 .9a7.8 7.8 0 0 0-2.6-1.5L14.3 3h-4l-.3 2.2a7.8 7.8 0 0 0-2.6 1.5l-2-.9-2 3.4 1.8 1.3a7.8 7.8 0 0 0 0 3L3.4 15l2 3.4 2-.9a7.8 7.8 0 0 0 2.6 1.5l.3 2.2h4l.3-2.2a7.8 7.8 0 0 0 2.6-1.5l2 .9 2-3.4-1.8-1.3Z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6v.5M12 17.2h.01",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 11.5a3 3 0 1 0 0-6M17.5 20h4a5.5 5.5 0 0 0-3.5-5.1",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.2 16.2 21 21",
  lock: "M6.5 10.5h11v10h-11zM8.5 10.5V7.5a3.5 3.5 0 1 1 7 0v3",
  eye: "M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  "eye-off": "M4 4l16 16M9.6 9.7a2.6 2.6 0 0 0 3.6 3.7 M6.3 6.6C3.9 8.2 2.5 12 2.5 12s3.5 5.5 9.5 5.5c1.6 0 3-.4 4.2-1M17.4 15.1c2.4-1.6 4.1-3.1 4.1-3.1S18 6.5 12 6.5c-.7 0-1.3.1-1.9.2",
  shield: "M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5-4-1.8-7-5.2-7-9.5V6l7-3Z",
  card: "M3 6.5h18v11H3zM3 10h18M6.5 14h4",
  "arrow-right": "M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5",
  tap: "M9 11V5.5a1.8 1.8 0 1 1 3.5 0V11m0-1.5a1.8 1.8 0 1 1 3.5 0V12m0-1a1.8 1.8 0 1 1 3.5 0v4.5a5.5 5.5 0 0 1-5.5 5.5h-1.2a5.5 5.5 0 0 1-4.4-2.2L5 15.5a1.9 1.9 0 0 1 3-2.3l1 1",
  "trend-up": "M4 17 10 11l3.5 3.5L20 8m0 0h-5m5 0v5",
  "trend-down": "M4 8l6 6 3.5-3.5L20 17m0 0h-5m5 0v-5",
  check: "M4.5 12.5 9.5 17.5 19.5 7",
};

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={STROKE[name]} />
    </svg>
  );
}

/** Which network a link belongs to, from its label or its address. */
export type Social =
  | "linkedin"
  | "facebook"
  | "instagram"
  | "x"
  | "youtube"
  | "whatsapp"
  | "telegram"
  | "github"
  | "link";

const MARKS: Record<Social, { path: string; title: string }> = {
  linkedin: {
    title: "LinkedIn",
    path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9z",
  },
  facebook: {
    title: "Facebook",
    path: "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.54-1.5h1.66V3.6c-.29-.04-1.28-.12-2.43-.12-2.4 0-4.05 1.47-4.05 4.16V9.9H7.5V13h2.72v8z",
  },
  instagram: {
    title: "Instagram",
    path: "M7.8 3h8.4A4.8 4.8 0 0 1 21 7.8v8.4a4.8 4.8 0 0 1-4.8 4.8H7.8A4.8 4.8 0 0 1 3 16.2V7.8A4.8 4.8 0 0 1 7.8 3Zm0 1.9A2.9 2.9 0 0 0 4.9 7.8v8.4a2.9 2.9 0 0 0 2.9 2.9h8.4a2.9 2.9 0 0 0 2.9-2.9V7.8a2.9 2.9 0 0 0-2.9-2.9ZM12 7.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm0 1.9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm4.8-2.9a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z",
  },
  x: {
    title: "X",
    path: "M17.2 3h3.3l-7.2 8.2L21.8 21h-6.6l-5.2-6.3L4.1 21H.8l7.7-8.8L.5 3h6.8l4.7 5.8Zm-1.2 16h1.8L7.9 4.8H6z",
  },
  youtube: {
    title: "YouTube",
    path: "M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1Z",
  },
  whatsapp: {
    title: "WhatsApp",
    path: "M12 2.8a9.1 9.1 0 0 0-7.8 13.8L3 21.2l4.8-1.2A9.1 9.1 0 1 0 12 2.8Zm0 1.9a7.2 7.2 0 1 1-3.7 13.4l-.3-.2-2.8.7.7-2.7-.2-.3A7.2 7.2 0 0 1 12 4.7Zm-3 3.5c-.2 0-.5.1-.7.4-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.7 4.2 3.7 2 .8 2.4.7 2.9.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3-1.6-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5.3-.5v-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4Z",
  },
  telegram: {
    title: "Telegram",
    path: "M21.5 4.3 18.3 19c-.24 1.07-.88 1.33-1.78.83l-4.92-3.63-2.37 2.29c-.26.26-.48.48-.99.48l.35-5 9.1-8.22c.4-.35-.09-.55-.61-.2L5.84 12.1 1 10.58c-1.05-.33-1.07-1.05.22-1.56l18.9-7.28c.87-.32 1.64.2 1.38 2.56Z",
  },
  github: {
    title: "GitHub",
    path: "M12 2.5a9.5 9.5 0 0 0-3 18.5c.47.09.65-.2.65-.46v-1.6c-2.65.58-3.2-1.27-3.2-1.27-.44-1.1-1.07-1.4-1.07-1.4-.87-.6.07-.58.07-.58.96.07 1.47 1 1.47 1 .85 1.47 2.24 1.04 2.79.8.08-.62.33-1.04.6-1.28-2.12-.24-4.34-1.06-4.34-4.7 0-1.04.37-1.89.98-2.56-.1-.24-.43-1.2.09-2.5 0 0 .8-.26 2.62.98a9.1 9.1 0 0 1 4.78 0c1.82-1.24 2.62-.98 2.62-.98.52 1.3.19 2.26.09 2.5.61.67.98 1.52.98 2.56 0 3.65-2.23 4.46-4.35 4.7.34.3.65.88.65 1.78v2.63c0 .26.17.56.66.46A9.5 9.5 0 0 0 12 2.5Z",
  },
  link: {
    title: "Link",
    path: "M10.6 13.4a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 1 0-5.66-5.66l-1.2 1.2 1.42 1.4 1.2-1.19a2 2 0 1 1 2.83 2.83l-2.83 2.83a2 2 0 0 1-2.83 0Zm2.8-2.8a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 1 0 5.66 5.66l1.2-1.2-1.42-1.4-1.2 1.19a2 2 0 1 1-2.83-2.83l2.83-2.83a2 2 0 0 1 2.83 0Z",
  },
};

export function socialOf(label: string, value: string): Social {
  const hay = `${label} ${value}`.toLowerCase();
  if (hay.includes("linkedin") || hay.includes("lnkd")) return "linkedin";
  if (hay.includes("facebook") || hay.includes("fb.")) return "facebook";
  if (hay.includes("instagram") || hay.includes("instagr")) return "instagram";
  if (hay.includes("youtube") || hay.includes("youtu.be")) return "youtube";
  if (hay.includes("whatsapp") || hay.includes("wa.me")) return "whatsapp";
  if (hay.includes("telegram") || hay.includes("t.me")) return "telegram";
  if (hay.includes("github")) return "github";
  if (hay.includes("twitter") || hay.match(/\bx\b/) || hay.includes("x.com")) return "x";
  return "link";
}

export function SocialMark({ name, className = "size-5" }: { name: Social; className?: string }) {
  const mark = MARKS[name];
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={mark.title} className={className}>
      <path d={mark.path} />
    </svg>
  );
}
