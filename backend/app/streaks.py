from datetime import date, timedelta


def calculate_streak(logs, as_of: date | None = None) -> tuple[int, bool]:
    """Return (resilient calendar-day streak, warning_active) from log-like objects.

    A single missed day is bridged. A second consecutive missed day ends the chain.
    An unlogged current day is treated as still in progress; evaluation starts yesterday.
    """
    today = as_of or date.today()
    by_day = {row.logged_date: row.status for row in logs if row.status in {"COMPLETED", "RECOVERED", "MISSED"}}
    cursor = today if today in by_day else today - timedelta(days=1)
    streak = 0
    completed_days = 0
    grace_used = False
    previous_was_missed = False
    while cursor in by_day or (cursor == today and cursor not in by_day):
        status = by_day.get(cursor)
        if status in {"COMPLETED", "RECOVERED"}:
            streak += 1
            completed_days += 1
            previous_was_missed = False
        elif status == "MISSED":
            if previous_was_missed:
                # Keep completions after the broken chain; they start a fresh streak.
                return completed_days, False
            grace_used = True
            previous_was_missed = True
            streak += 1
        else:
            break
        cursor -= timedelta(days=1)
    return streak, grace_used
