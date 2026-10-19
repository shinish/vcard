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
    "social": (
        "Amazon",
        "Apple Music",
        "ArtStation",
        "Bandcamp",
        "Behance",
        "Bitbucket",
        "Bluesky",
        "Calendly",
        "CodePen",
        "Crunchbase",
        "DEV",
        "Dribbble",
        "Etsy",
        "Facebook",
        "Figma",
        "Fiverr",
        "Flickr",
        "GitHub",
        "GitLab",
        "Goodreads",
        "Instagram",
        "Ko-fi",
        "LinkedIn",
        "Linktree",
        "Mastodon",
        "Medium",
        "Patreon",
        "PayPal",
        "Pinterest",
        "Quora",
        "Reddit",
        "Shopify",
        "Slack",
        "Snapchat",
        "SoundCloud",
        "Spotify",
        "Stack Overflow",
        "Steam",
        "Strava",
        "Substack",
        "Threads",
        "TikTok",
        "Tripadvisor",
        "Tumblr",
        "Twitch",
        "Unsplash",
        "Upwork",
        "Vimeo",
        "VK",
        "Weibo",
        "X",
        "Xing",
        "Yelp",
        "YouTube",
    ),
    "im": (
        "WhatsApp",
        "Telegram",
        "Signal",
        "Messenger",
        "Discord",
        "Slack",
        "Skype",
        "Viber",
        "LINE",
        "WeChat",
        "Zoom",
    ),
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
    "about",
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
# The templates a company can dress its cards in. The first nine are what the
# picker offers; `rays` and `solid` came first and stay valid so that nobody's
# saved choice breaks, they are simply no longer offered.
THEMES = (
    "plain",       # Minimal
    "corporate",
    "ink",         # Executive
    "gradient",
    "glass",
    "luxury",
    "creative",
    "grid",        # Tech
    "wallpaper",   # Custom: your own picture
    "dots",        # Halftone
    "topo",        # Contour
    "stripes",     # Bands
    "aurora",
    "blueprint",
    "carbon",
    "linen",
    "horizon",
    "noir",
    "terrazzo",
    "neon",
    "arc",
    # Offered before the set above was named; still valid, so a company that
    # picked one keeps it rather than being quietly moved.
    "rays",
    "solid",
)
DEFAULT_THEME = "plain"

# "wallpaper" needs an uploaded picture behind the card. How it fills the
# screen is a choice: cover keeps the proportions and crops, stretch distorts
# to fit exactly, tile repeats a pattern.
WALLPAPER_FITS = ("cover", "stretch", "tile")
DEFAULT_WALLPAPER_FIT = "cover"

# Type on the card. Each key maps to a pair of web fonts on the frontend.
FONTS = (
    "poppins", "inter", "playfair", "plex", "cairo", "lato", "nunito",
    "raleway", "montserrat", "lora", "manrope", "oswald", "quicksand",
)
DEFAULT_FONT = "poppins"

# How large the card reads. Applied as a zoom on the card itself, because the
# type sizes are in rem and resolve against the root rather than the card.
TYPE_SCALES = ("compact", "normal", "large", "xl")
DEFAULT_TYPE_SCALE = "normal"

# The card holder's photo: how it is cut, where it sits, how big it runs.
PHOTO_SHAPES = ("square", "circle")
DEFAULT_PHOTO_SHAPE = "square"
PHOTO_ALIGNS = ("left", "center", "right")
DEFAULT_PHOTO_ALIGN = "left"
PHOTO_SIZES = ("small", "medium", "large")
DEFAULT_PHOTO_SIZE = "medium"

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
MAX_LOGO_SCALE = 400
DEFAULT_LOGO_SCALE = 100

# Card language, set per company. Arabic also flips the card to right-to-left.
LANGUAGES = ("en", "ar", "de", "fr")
DEFAULT_LANGUAGE = "en"
RTL_LANGUAGES = ("ar",)
