from dataclasses import dataclass
from datetime import date, timedelta

from app.streaks import calculate_streak


@dataclass
class Log:
    logged_date: date
    status: str


def chain(*statuses, end=date(2025, 1, 3)):
    return [Log(end - timedelta(days=i), status) for i, status in enumerate(statuses)]


def test_completed_days_count():
    assert calculate_streak(chain("COMPLETED", "COMPLETED", "COMPLETED"), date(2025, 1, 3)) == (3, False)


def test_one_miss_is_bridged():
    assert calculate_streak(chain("COMPLETED", "MISSED", "COMPLETED"), date(2025, 1, 3)) == (3, True)


def test_two_misses_break_chain():
    assert calculate_streak(chain("COMPLETED", "MISSED", "MISSED", "COMPLETED"), date(2025, 1, 3)) == (0, False)


def test_open_today_keeps_yesterdays_chain():
    logs = [Log(date(2025, 1, 2), "COMPLETED")]
    assert calculate_streak(logs, date(2025, 1, 3)) == (1, False)
