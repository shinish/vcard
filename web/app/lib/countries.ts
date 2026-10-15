/** Country names for the address field.
 *
 *  Only the ISO codes are listed; the names come from Intl.DisplayNames, which
 *  both Node and every current browser provide. That beats hand-maintaining
 *  250 English names, and it stays correct as names change.
 */
const ISO_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS " +
  "BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE " +
  "EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN " +
  "HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC " +
  "LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS " +
  "RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW";

function buildCountries(): string[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    display = null;
  }
  const names = ISO_CODES.split(" ").map((code) => {
    try {
      return display?.of(code) ?? code;
    } catch {
      return code;
    }
  });
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

export const COUNTRIES = buildCountries();

/** One country's name, from the browser rather than a hand-kept list. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The flag emoji for a country, built from its letters. */
export function flagOf(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

/** The same ISO codes as names-and-codes, for pickers that store a code. */
export const REGIONS: { code: string; name: string }[] = ISO_CODES.split(" ")
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const DIAL_CODES: { code: string; dial: string }[] = [
  { code: "OM", dial: "+968" },
  { code: "AE", dial: "+971" },
  { code: "SA", dial: "+966" },
  { code: "QA", dial: "+974" },
  { code: "BH", dial: "+973" },
  { code: "KW", dial: "+965" },
  { code: "IN", dial: "+91" },
  { code: "PK", dial: "+92" },
  { code: "BD", dial: "+880" },
  { code: "LK", dial: "+94" },
  { code: "PH", dial: "+63" },
  { code: "EG", dial: "+20" },
  { code: "JO", dial: "+962" },
  { code: "LB", dial: "+961" },
  { code: "TR", dial: "+90" },
  { code: "GB", dial: "+44" },
  { code: "IE", dial: "+353" },
  { code: "DE", dial: "+49" },
  { code: "FR", dial: "+33" },
  { code: "NL", dial: "+31" },
  { code: "IT", dial: "+39" },
  { code: "ES", dial: "+34" },
  { code: "CH", dial: "+41" },
  { code: "SE", dial: "+46" },
  { code: "US", dial: "+1" },
  { code: "CA", dial: "+1" },
  { code: "AU", dial: "+61" },
  { code: "NZ", dial: "+64" },
  { code: "SG", dial: "+65" },
  { code: "MY", dial: "+60" },
  { code: "ZA", dial: "+27" },
  { code: "KE", dial: "+254" },
  { code: "CN", dial: "+86" },
  { code: "JP", dial: "+81" },
  { code: "KR", dial: "+82" },
];

/** Split a stored number into its dial code and the rest. */
export function splitDial(value: string): { dial: string; rest: string } {
  const trimmed = (value || "").trim();
  // Longest first, so +971 is not read as +97.
  const match = [...DIAL_CODES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((entry) => trimmed.startsWith(entry.dial));
  if (!match) return { dial: "", rest: trimmed };
  return { dial: match.dial, rest: trimmed.slice(match.dial.length).trim() };
}
