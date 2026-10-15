/** Dial codes for the phone field.
 *
 *  Gulf states first because that is where these cards are handed out, then
 *  the rest alphabetically. A number is still stored as one merged string, so
 *  the vCard and the card page need no special handling.
 */
export const DIAL_CODES: { code: string; country: string }[] = [
  { code: "+968", country: "Oman" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+974", country: "Qatar" },
  { code: "+973", country: "Bahrain" },
  { code: "+965", country: "Kuwait" },
  { code: "+91", country: "India" },
  { code: "+44", country: "United Kingdom" },
  { code: "+1", country: "United States / Canada" },
  { code: "+61", country: "Australia" },
  { code: "+880", country: "Bangladesh" },
  { code: "+32", country: "Belgium" },
  { code: "+55", country: "Brazil" },
  { code: "+86", country: "China" },
  { code: "+20", country: "Egypt" },
  { code: "+33", country: "France" },
  { code: "+49", country: "Germany" },
  { code: "+852", country: "Hong Kong" },
  { code: "+62", country: "Indonesia" },
  { code: "+98", country: "Iran" },
  { code: "+964", country: "Iraq" },
  { code: "+353", country: "Ireland" },
  { code: "+972", country: "Israel" },
  { code: "+39", country: "Italy" },
  { code: "+81", country: "Japan" },
  { code: "+962", country: "Jordan" },
  { code: "+254", country: "Kenya" },
  { code: "+961", country: "Lebanon" },
  { code: "+60", country: "Malaysia" },
  { code: "+960", country: "Maldives" },
  { code: "+52", country: "Mexico" },
  { code: "+212", country: "Morocco" },
  { code: "+977", country: "Nepal" },
  { code: "+31", country: "Netherlands" },
  { code: "+64", country: "New Zealand" },
  { code: "+234", country: "Nigeria" },
  { code: "+92", country: "Pakistan" },
  { code: "+63", country: "Philippines" },
  { code: "+48", country: "Poland" },
  { code: "+351", country: "Portugal" },
  { code: "+7", country: "Russia" },
  { code: "+65", country: "Singapore" },
  { code: "+27", country: "South Africa" },
  { code: "+82", country: "South Korea" },
  { code: "+34", country: "Spain" },
  { code: "+94", country: "Sri Lanka" },
  { code: "+46", country: "Sweden" },
  { code: "+41", country: "Switzerland" },
  { code: "+255", country: "Tanzania" },
  { code: "+66", country: "Thailand" },
  { code: "+90", country: "Türkiye" },
  { code: "+256", country: "Uganda" },
  { code: "+84", country: "Vietnam" },
  { code: "+967", country: "Yemen" },
];

export const DEFAULT_DIAL = "+968";

// Longest first, so +968 wins over +96 and +1 never swallows +1x codes wrongly.
const SORTED = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);

/** Split a stored number back into its dial code and the local part. */
export function splitPhone(value: string): { dial: string; local: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { dial: DEFAULT_DIAL, local: "" };
  const match = SORTED.find((d) => trimmed.startsWith(d.code));
  if (!match) {
    // A number typed before country codes existed, or an unlisted one: leave
    // it alone rather than silently reinterpreting someone's data.
    return { dial: "", local: trimmed };
  }
  return { dial: match.code, local: trimmed.slice(match.code.length).trim() };
}

/** Merge them back into the single value that is stored and exported. */
export function joinPhone(dial: string, local: string): string {
  const number = (local ?? "").trim();
  if (!number) return "";
  return dial ? `${dial} ${number}` : number;
}
