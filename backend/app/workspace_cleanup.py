"""Deprecated compatibility shim for the retired smoking data cleanup.

This module intentionally performs no writes. Historical user records must remain
available to Habitly and must never be filtered by habit name or event content.
"""


def without_smoking_workspace_data(workspace: dict) -> dict:
    """Return the workspace unchanged for callers left on older integrations."""
    return workspace


def purge_legacy_smoking_data(engine) -> None:
    """Deprecated no-op retained so stale imports cannot delete user data."""
    return None
