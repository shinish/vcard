PRAGMA foreign_keys = ON;

-- The company's own details. A new contact starts from these, then diverges.
-- One row per branch. The name repeats across branches; the branch label and
-- the details are what differ, so uniqueness is on the pair.
CREATE TABLE IF NOT EXISTS companies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  branch     TEXT NOT NULL DEFAULT '',
  slug       TEXT NOT NULL UNIQUE,
  phone      TEXT,
  email      TEXT,
  website    TEXT,
  street     TEXT,
  city       TEXT,
  region     TEXT,
  postal     TEXT,
  country    TEXT,
  logo_path  TEXT,
  logo_position TEXT NOT NULL DEFAULT 'top-center',
  logo_scale INTEGER NOT NULL DEFAULT 100,
  language   TEXT NOT NULL DEFAULT 'en',
  theme      TEXT NOT NULL DEFAULT 'plain',
  wallpaper_path TEXT,
  wallpaper_fit  TEXT NOT NULL DEFAULT 'cover',
  font       TEXT NOT NULL DEFAULT 'poppins',
  favicon_path   TEXT,
  require_consent INTEGER NOT NULL DEFAULT 0,
  -- Switches for one company's cards. Off means the public page refuses.
  public_sharing INTEGER NOT NULL DEFAULT 1,
  allow_indexing INTEGER NOT NULL DEFAULT 0,
  allow_save     INTEGER NOT NULL DEFAULT 1,
  show_company_name INTEGER NOT NULL DEFAULT 1,
  show_branch    INTEGER NOT NULL DEFAULT 1,
  share_message  TEXT,
  show_qr        INTEGER NOT NULL DEFAULT 1,
  show_qr_download INTEGER NOT NULL DEFAULT 1,
  -- JSON array of hex colours; the templates read them in order.
  accents    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (name, branch)
);

-- Every admin spans every company: there is no per-company role.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  disabled      INTEGER NOT NULL DEFAULT 0,
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- A password was right but the one-time code is still outstanding. Such a
  -- session can reach the code check and nothing else.
  pending_2fa INTEGER NOT NULL DEFAULT 0
);

-- One-use codes for the admin who has lost their phone. Hashed like a
-- password, because that is what they are.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);

-- public_id is the share link and, since that page has no login, the only
-- thing guarding the record: 22 chars of base62, ~131 bits.
CREATE TABLE IF NOT EXISTS contacts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id      TEXT NOT NULL UNIQUE,
  company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix         TEXT,
  first_name     TEXT NOT NULL,
  middle_name    TEXT,
  last_name      TEXT,
  suffix         TEXT,
  nickname       TEXT,
  phonetic_first TEXT,
  phonetic_last  TEXT,
  org            TEXT,
  department     TEXT,
  job_title      TEXT,
  note           TEXT,
  photo_path     TEXT,  -- high quality, shown on the card page
  photo_small_path TEXT, -- small, embedded in the .vcf so phones import it
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);

-- Phones, emails, addresses and the rest repeat with arbitrary labels on both
-- iPhone and Android, so they cannot be flat columns.
-- ponytail: address components live in value as JSON rather than a third
-- table. Split it out if addresses ever need querying by city.
CREATE TABLE IF NOT EXISTS contact_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN
               ('phone','email','url','address','date','social','im','relation')),
  label      TEXT NOT NULL,
  value      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fields_contact ON contact_fields(contact_id);

-- Settings an administrator can change without touching the environment.
-- A value here overrides the matching environment variable.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Pictures and videos a company shows on every card it owns: the portfolio is
-- set once per company, not per person.
CREATE TABLE IF NOT EXISTS company_media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('image','video')),
  path       TEXT,            -- an uploaded picture
  url        TEXT,            -- a video link (YouTube, Vimeo) or a link out
  caption    TEXT,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_company ON company_media(company_id);

-- What happened on a card. One row per event, so counts and a recent history
-- both come out of the same table.
-- ponytail: no IP and no country. The address is hashed with a daily salt and
-- thrown away; a country would need an IP-geolocation provider, which is a
-- third party this app does not have.
CREATE TABLE IF NOT EXISTS card_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN
               ('view','save','qr','signature','call','email','website','map','share')),
  at         TEXT NOT NULL,
  source     TEXT,            -- 'qr' when the link carried ?s=qr, else a referrer host
  device     TEXT,            -- 'phone', 'tablet' or 'computer', read off the user agent
  -- A salted hash of the address and agent, re-salted every day: enough to
  -- tell two opens apart within a day, useless for following anyone across
  -- days, and no address is ever written down.
  visitor    TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_contact ON card_events(contact_id, at);

-- One-time codes: first sign-in and password resets. Only the hash is kept,
-- so a database copy does not hand out working codes.
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('activate','reset')),
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_contact ON otp_codes(contact_id, purpose);

-- Codes for an administrator who has forgotten their password. Separate from
-- otp_codes, which belongs to card holders: an admin is a different account in
-- a different table, and mixing the two would need a nullable owner on both.
CREATE TABLE IF NOT EXISTS user_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_codes ON user_codes(user_id);

-- Card holders sign in to their own page; admins keep their own sessions table.
CREATE TABLE IF NOT EXISTS contact_sessions (
  token      TEXT PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
