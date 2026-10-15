"""The contact shape, mirroring what the iPhone and Android address books hold.

Singular values are columns on `contacts`. Anything a phone lets you add more
than once, with a label, is a row in `contact_fields`.
"""

# Columns on `contacts` that the admin form posts directly.
SINGLE = (
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
)

# Repeatable kinds, with the labels each phone offers by default. Any other
# label is kept verbatim and round-trips through vCard as a custom label.
LABELS: dict[str, tuple[str, ...]] = {
    "phone": ("mobile", "iPhone", "home", "work", "main", "home fax", "work fax", "pager", "other"),
    "email": ("home", "work", "iCloud", "school", "other"),
    "url": ("homepage", "home", "work", "blog", "other"),
    "address": ("home", "work", "other"),
    "date": ("birthday", "anniversary", "other"),
    "social": ("Twitter", "Facebook", "LinkedIn", "Instagram", "YouTube", "GitHub"),
    "im": ("WhatsApp", "Skype", "Telegram", "Signal", "Slack"),
    "relation": ("spouse", "partner", "child", "mother", "father", "assistant", "manager"),
}

KINDS = tuple(LABELS)

# Components of an address value, stored as JSON in contact_fields.value.
ADDRESS_PARTS = ("street", "city", "region", "postal", "country")
# Kept beside the text when an address came from the geocoder, so the card can
# show a map. Absent for anything typed by hand, and the card copes.
ADDRESS_COORDS = ("lat", "lon")

# A company's own contact details, used to seed a new contact's fields.
COMPANY_DETAILS = (
    "phone",
    "email",
    "website",
    "street",
    "city",
    "region",
    "postal",
    "country",
)

# Background treatments for the public card. Pure CSS on the frontend, so a
# template costs no image assets and scales to any screen.
THEMES = ("plain", "ink", "gradient", "grid", "rays", "solid", "wallpaper")
DEFAULT_THEME = "plain"

# "wallpaper" needs an uploaded picture behind the card. How it fills the
# screen is a choice: cover keeps the proportions and crops, stretch distorts
# to fit exactly, tile repeats a pattern.
WALLPAPER_FITS = ("cover", "stretch", "tile")
DEFAULT_WALLPAPER_FIT = "cover"

# Type on the card. Each key maps to a pair of web fonts on the frontend.
FONTS = ("poppins", "inter", "playfair", "plex", "cairo")
DEFAULT_FONT = "poppins"

# A company may carry a small palette rather than a single accent.
MAX_ACCENTS = 6

# Where the logo sits on the card: the eight edge and corner positions of a
# three-by-three grid. The centre is left out; that is where the card's own
# content lives.
LOGO_POSITIONS = (
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
)
DEFAULT_LOGO_POSITION = "top-center"

# Logo display size as a percentage of the default. Clamped so it cannot be
# made so large that it swamps the card, or so small it is unreadable.
MIN_LOGO_SCALE = 50
MAX_LOGO_SCALE = 220
DEFAULT_LOGO_SCALE = 100

# Card language, set per company. Arabic also flips the card to right-to-left.
LANGUAGES = ("en", "ar", "de", "fr")
DEFAULT_LANGUAGE = "en"
RTL_LANGUAGES = ("ar",)
