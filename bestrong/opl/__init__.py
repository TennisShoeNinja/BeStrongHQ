"""OpenPowerlifting integration.

Pulls a lifter's meet history from the public OpenPowerlifting dataset
and surfaces it on their athlete profile. The data is public domain
(CC0), so no configuration gates the lookup.
"""

from .client import OplError, fetch_lifter_csv, search_lifters

__all__ = ["OplError", "fetch_lifter_csv", "search_lifters"]
