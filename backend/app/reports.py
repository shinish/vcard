"""The monthly report, sent by the app itself.

No cron, no launchd, no scheduler to install and forget: one task woken every
hour that asks whether this month's report has gone out yet. The answer lives
in settings, so a restart cannot send it twice and a machine that was asleep
on the first of the month still sends it on the second.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime

from . import mailer
from . import settings as app_settings

CHECK_EVERY = 60 * 60


def due(today: datetime) -> bool:
    """True when a report is owed: switched on, addressed, and not yet sent."""
    if not app_settings.flag("notify_monthly") or not app_settings.get("notify_to").strip():
        return False
    if not mailer.configured():
        return False
    return app_settings.get("monthly_sent") != today.strftime("%Y-%m")


async def loop() -> None:
    """Check once an hour, forever. Any failure waits for the next hour."""
    from .routes_admin import send_report  # late: routes import this module's app

    while True:
        try:
            today = datetime.now(UTC)
            if due(today):
                send_report(30)
                app_settings.put("monthly_sent", today.strftime("%Y-%m"))
        except (mailer.MailError, OSError, ValueError):
            # A report is not worth taking the app down for.
            pass
        await asyncio.sleep(CHECK_EVERY)


@contextlib.asynccontextmanager
async def running():
    """Start the loop alongside the app and stop it with the app."""
    task = asyncio.create_task(loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
