"""
Holiday checker using Calendarific API.
Falls back to a hardcoded list of Indian national holidays for 2026
when CALENDARIFIC_API_KEY is not set.
"""

import os
from datetime import date
from functools import lru_cache

import requests

from backend.utils.secrets import get

# ── Hardcoded fallback: Indian national holidays 2026 ─────────────────────
_INDIA_HOLIDAYS_2026: set[date] = {
    date(2026, 1, 26),  # Republic Day
    date(2026, 3, 25),  # Holi
    date(2026, 4, 14),  # Dr. Ambedkar Jayanti / Good Friday
    date(2026, 4, 17),  # Good Friday (approximate)
    date(2026, 8, 15),  # Independence Day
    date(2026, 10, 2),  # Gandhi Jayanti
    date(2026, 10, 24), # Dussehra (approximate)
    date(2026, 11, 12), # Diwali (approximate)
    date(2026, 12, 25), # Christmas
}


@lru_cache(maxsize=512)
def is_holiday(check_date: date, country_code: str = "IN") -> bool:
    """Return True if check_date is a public holiday in the given country."""
    api_key = get("CALENDARIFIC_API_KEY")

    if not api_key:
        if country_code.upper() == "IN":
            return check_date in _INDIA_HOLIDAYS_2026
        return False

    try:
        resp = requests.get(
            "https://calendarific.com/api/v2/holidays",
            params={
                "api_key": api_key,
                "country": country_code,
                "year": check_date.year,
                "month": check_date.month,
                "day": check_date.day,
                "type": "national",
            },
            timeout=5,
        )
        data = resp.json()
        holidays = data.get("response", {}).get("holidays", [])
        return len(holidays) > 0
    except Exception:
        # API failure → fall back to hardcoded list for IN
        if country_code.upper() == "IN":
            return check_date in _INDIA_HOLIDAYS_2026
        return False
