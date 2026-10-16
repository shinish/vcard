/** Card translations.
 *
 *  Set per company, so a card reads in the language its company works in.
 *  Arabic also flips the card to right-to-left, which is a layout change, not
 *  only a wording one.
 */

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "fr", label: "French", native: "Français" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: Language = "en";
const RTL: Language[] = ["ar"];

export function isRtl(lang: Language): boolean {
  return RTL.includes(lang);
}

type Strings = {
  saveContact: string;
  consent: string;
  savingOff: string;
  addToContacts: string;
  call: string;
  sendEmail: string;
  visitWebsite: string;
  directions: string;
  share: string;
  shareCard: string;
  linkCopied: string;
  copyLink: string;
  savePdf: string;
  exchange: string;
  exchangeIntro: string;
  yourName: string;
  yourEmail: string;
  yourPhone: string;
  yourMessage: string;
  sendDetails: string;
  sending: string;
  exchangeSent: string;
  exchangeFailed: string;
  about: string;
  showcase: string;
  details: string;
  chooseLanguage: string;
  watch: string;
  downloaded: (name: string) => string;
  scanToOpen: string;
  downloadQr: string;
  openMap: string;
  mapOf: (place: string) => string;
  qrAlt: (name: string) => string;
  notFoundTitle: string;
  notFoundBody: string;
};

const UI: Record<Language, Strings> = {
  en: {
    saveContact: "Save contact",
    consent: "I agree to this card adding these details to my contacts.",
    savingOff: "This card cannot be saved to a phone. Use the link or the QR code to come back to it.",
    addToContacts: "Add to contacts",
    call: "Call",
    sendEmail: "Email",
    visitWebsite: "Website",
    directions: "Directions",
    share: "Share",
    shareCard: "Share this card",
    linkCopied: "Link copied",
    copyLink: "Copy link",
    savePdf: "Save as PDF",
    exchange: "Exchange contact",
    exchangeIntro: "Leave your details and they go straight to this inbox.",
    yourName: "Your name",
    yourEmail: "Your email",
    yourPhone: "Your phone",
    yourMessage: "Message (optional)",
    sendDetails: "Send my details",
    sending: "Sending…",
    exchangeSent: "Sent. Thank you.",
    exchangeFailed: "Could not send it. Please try again.",
    about: "About",
    showcase: "What we do",
    details: "Contact details",
    chooseLanguage: "Language",
    watch: "Watch",
    downloaded: (n) => `Downloaded. Open the file to add ${n} to your contacts.`,
    scanToOpen: "Scan to open this card on another phone",
    downloadQr: "Download QR code (PNG)",
    openMap: "Open the map",
    mapOf: (p) => `Map showing ${p}`,
    qrAlt: (n) => `QR code linking to this card for ${n}`,
    notFoundTitle: "No card at this link",
    notFoundBody: "The link may have a typo, or the card was removed by whoever made it.",
  },
  ar: {
    saveContact: "حفظ جهة الاتصال",
    consent: "أوافق على إضافة هذه البيانات إلى جهات الاتصال.",
    savingOff: "لا يمكن حفظ هذه البطاقة على الهاتف. استخدم الرابط أو رمز QR للعودة إليها.",
    addToContacts: "إضافة إلى جهات الاتصال",
    call: "اتصال",
    sendEmail: "بريد إلكتروني",
    visitWebsite: "الموقع",
    directions: "الاتجاهات",
    share: "مشاركة",
    shareCard: "شارك هذه البطاقة",
    linkCopied: "تم نسخ الرابط",
    copyLink: "نسخ الرابط",
    savePdf: "حفظ بصيغة PDF",
    exchange: "تبادل جهة الاتصال",
    exchangeIntro: "اترك بياناتك لتصل مباشرة إلى صاحب البطاقة.",
    yourName: "اسمك",
    yourEmail: "بريدك الإلكتروني",
    yourPhone: "هاتفك",
    yourMessage: "رسالة (اختياري)",
    sendDetails: "أرسل بياناتي",
    sending: "جارٍ الإرسال…",
    exchangeSent: "تم الإرسال. شكرًا لك.",
    exchangeFailed: "تعذّر الإرسال. حاول مرة أخرى.",
    about: "نبذة",
    showcase: "ما نقدمه",
    details: "بيانات الاتصال",
    chooseLanguage: "اللغة",
    watch: "مشاهدة",
    downloaded: (n) => `تم التنزيل. افتح الملف لإضافة ${n} إلى جهات الاتصال.`,
    scanToOpen: "امسح الرمز لفتح البطاقة على هاتف آخر",
    downloadQr: "تنزيل رمز الاستجابة السريعة (PNG)",
    openMap: "فتح الخريطة",
    mapOf: (p) => `خريطة تُظهر ${p}`,
    qrAlt: (n) => `رمز استجابة سريعة يفتح بطاقة ${n}`,
    notFoundTitle: "لا توجد بطاقة على هذا الرابط",
    notFoundBody: "قد يكون الرابط غير صحيح، أو حُذفت البطاقة من قِبل من أنشأها.",
  },
  de: {
    saveContact: "Kontakt speichern",
    consent: "Ich bin damit einverstanden, diese Daten in meine Kontakte aufzunehmen.",
    savingOff: "Diese Karte kann nicht gespeichert werden. Nutzen Sie den Link oder den QR-Code.",
    addToContacts: "Zu Kontakten hinzufügen",
    call: "Anrufen",
    sendEmail: "E-Mail",
    visitWebsite: "Website",
    directions: "Route",
    share: "Teilen",
    shareCard: "Diese Karte teilen",
    linkCopied: "Link kopiert",
    copyLink: "Link kopieren",
    savePdf: "Als PDF speichern",
    exchange: "Kontakt austauschen",
    exchangeIntro: "Hinterlassen Sie Ihre Daten – sie gehen direkt an dieses Postfach.",
    yourName: "Ihr Name",
    yourEmail: "Ihre E-Mail",
    yourPhone: "Ihr Telefon",
    yourMessage: "Nachricht (optional)",
    sendDetails: "Meine Daten senden",
    sending: "Senden…",
    exchangeSent: "Gesendet. Vielen Dank.",
    exchangeFailed: "Konnte nicht gesendet werden. Bitte erneut versuchen.",
    about: "Über",
    showcase: "Was wir machen",
    details: "Kontaktdaten",
    chooseLanguage: "Sprache",
    watch: "Ansehen",
    downloaded: (n) => `Heruntergeladen. Öffnen Sie die Datei, um ${n} zu Ihren Kontakten hinzuzufügen.`,
    scanToOpen: "Scannen, um diese Karte auf einem anderen Telefon zu öffnen",
    downloadQr: "QR-Code herunterladen (PNG)",
    openMap: "Karte öffnen",
    mapOf: (p) => `Karte mit ${p}`,
    qrAlt: (n) => `QR-Code zur Karte von ${n}`,
    notFoundTitle: "Unter diesem Link gibt es keine Karte",
    notFoundBody: "Der Link enthält womöglich einen Tippfehler, oder die Karte wurde gelöscht.",
  },
  fr: {
    saveContact: "Enregistrer le contact",
    consent: "J’accepte d’ajouter ces coordonnées à mes contacts.",
    savingOff: "Cette carte ne peut pas être enregistrée. Utilisez le lien ou le QR code.",
    addToContacts: "Ajouter aux contacts",
    call: "Appeler",
    sendEmail: "E-mail",
    visitWebsite: "Site web",
    directions: "Itinéraire",
    share: "Partager",
    shareCard: "Partager cette carte",
    linkCopied: "Lien copié",
    copyLink: "Copier le lien",
    savePdf: "Enregistrer en PDF",
    exchange: "Échanger les coordonnées",
    exchangeIntro: "Laissez vos coordonnées, elles arrivent directement dans cette boîte.",
    yourName: "Votre nom",
    yourEmail: "Votre e-mail",
    yourPhone: "Votre téléphone",
    yourMessage: "Message (facultatif)",
    sendDetails: "Envoyer mes coordonnées",
    sending: "Envoi…",
    exchangeSent: "Envoyé. Merci.",
    exchangeFailed: "Impossible d’envoyer. Réessayez.",
    about: "À propos",
    showcase: "Ce que nous faisons",
    details: "Coordonnées",
    chooseLanguage: "Langue",
    watch: "Regarder",
    downloaded: (n) => `Téléchargé. Ouvrez le fichier pour ajouter ${n} à vos contacts.`,
    scanToOpen: "Scannez pour ouvrir cette carte sur un autre téléphone",
    downloadQr: "Télécharger le QR code (PNG)",
    openMap: "Ouvrir la carte",
    mapOf: (p) => `Carte indiquant ${p}`,
    qrAlt: (n) => `QR code menant à la carte de ${n}`,
    notFoundTitle: "Aucune carte à ce lien",
    notFoundBody: "Le lien comporte peut-être une erreur, ou la carte a été supprimée.",
  },
};

/** The standard field labels. Anything an admin typed themselves is left
 *  exactly as written: it is their words, not ours to translate. */
const LABELS: Record<Language, Record<string, string>> = {
  en: {},
  ar: {
    mobile: "جوال", iPhone: "آيفون", home: "المنزل", work: "العمل", main: "الرئيسي",
    "home fax": "فاكس المنزل", "work fax": "فاكس العمل", pager: "جهاز نداء", other: "أخرى",
    iCloud: "آي كلاود", school: "المدرسة", homepage: "الموقع", blog: "مدونة",
    birthday: "تاريخ الميلاد", anniversary: "ذكرى سنوية",
    spouse: "الزوج/الزوجة", partner: "الشريك", child: "الابن/الابنة",
    mother: "الأم", father: "الأب", assistant: "المساعد", manager: "المدير",
  },
  de: {
    mobile: "Mobil", home: "Privat", work: "Arbeit", main: "Haupt",
    "home fax": "Fax privat", "work fax": "Fax Arbeit", pager: "Pager", other: "Sonstige",
    school: "Schule", homepage: "Webseite", blog: "Blog",
    birthday: "Geburtstag", anniversary: "Jahrestag",
    spouse: "Ehepartner", partner: "Partner", child: "Kind",
    mother: "Mutter", father: "Vater", assistant: "Assistenz", manager: "Vorgesetzte*r",
  },
  fr: {
    mobile: "Mobile", home: "Domicile", work: "Bureau", main: "Principal",
    "home fax": "Fax domicile", "work fax": "Fax bureau", pager: "Bipeur", other: "Autre",
    school: "École", homepage: "Site web", blog: "Blog",
    birthday: "Anniversaire", anniversary: "Anniversaire de mariage",
    spouse: "Conjoint", partner: "Partenaire", child: "Enfant",
    mother: "Mère", father: "Père", assistant: "Assistant", manager: "Responsable",
  },
};

export function t(lang: Language): Strings {
  return UI[lang] ?? UI.en;
}

export function fieldLabel(lang: Language, label: string): string {
  return LABELS[lang]?.[label] ?? label;
}
