"""Print journey.sql as one line, ready for PostHog execute-sql.

    python3 -I render.py                      # yesterday, Taipei calendar day
    python3 -I render.py 2026-10-30           # one Taipei day
    python3 -I render.py 2026-10-30 2026-11-02  # Taipei days, end inclusive

Taipei is UTC+8 with no DST, so a Taipei day D runs from D-1 16:00 UTC to D 16:00 UTC.
"""

import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

TPE = timezone(timedelta(hours=8))


def utc_start(day: date) -> str:
    start = datetime(day.year, day.month, day.day, tzinfo=TPE).astimezone(timezone.utc)
    return start.strftime("'%Y-%m-%d %H:%M:%S'")


args = sys.argv[1:]
today = datetime.now(TPE).date()
first = date.fromisoformat(args[0]) if args else today - timedelta(days=1)
last = date.fromisoformat(args[1]) if len(args) > 1 else first

sql = (Path(__file__).parent / "journey.sql").read_text()
sql = re.sub(r"--[^\n]*", "", sql)
sql = sql.replace("{{START}}", utc_start(first)).replace("{{END}}", utc_start(last + timedelta(days=1)))
print(f"-- Taipei {first} to {last}", file=sys.stderr)
print(re.sub(r"\s+", " ", sql).strip())
