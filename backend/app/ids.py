"""Public identifiers for shareable links."""

import secrets
import string

# Case-sensitive base62. No hyphens, so it survives a double-click selection
# and reads cleanly in a QR code.
ALPHABET = string.digits + string.ascii_uppercase + string.ascii_lowercase
LENGTH = 22  # 62**22 is about 2**131


def new_public_id(length: int = LENGTH) -> str:
    """Generate a share id.

    The public card page has no login, so this value is the only thing standing
    between a stranger and someone's contact details. It must stay long enough
    that guessing is hopeless; do not shorten it for prettier URLs.
    """
    return "".join(secrets.choice(ALPHABET) for _ in range(length))
