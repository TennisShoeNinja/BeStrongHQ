"""OpenPowerlifting integration.

Pulls a lifter's meet history from the public OpenPowerlifting dataset
and surfaces it on their athlete profile. Available in both local and
hosted modes; the data is public domain (CC0) and there's no per-tenant
configuration to gate behind.
"""

from .client import OplError, fetch_lifter_csv, search_lifters

__all__ = ["OplError", "fetch_lifter_csv", "search_lifters"]
