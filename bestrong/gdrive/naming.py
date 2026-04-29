"""Configurable naming pattern system for program spreadsheet filenames.

Coaches define a template like:
    {athlete}'s Program {number} - ({dates}) - {theme}

This module converts that template into a regex with named capture groups,
then uses it to extract metadata (athlete name, program number, etc.)
from actual filenames.

Supported tokens:
    {athlete}  - The athlete's name (required for organization)
    {number}   - Program number (digits)
    {dates}    - Date range like "02/01/26 - 02/22/26"
    {theme}    - Program theme/name (any text)
    {any}      - Wildcard, matches anything (ignored in extraction)

Literal text between tokens is matched as-is, with some flexibility
for common separator variations (hyphens, en dashes, em dashes).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


DEFAULT_PATTERN = "{athlete}'s Program {number} - ({dates}) - {theme}"


PRESETS: list[dict[str, str]] = [
    {
        "id": "alex",
        "label": "Name's Program # - (dates) - Theme",
        "pattern": "{athlete}'s Program {number} - ({dates}) - {theme}",
        "example": "Ed's Program 35 - (02/01/26 - 02/22/26) - Strength Block",
    },
    {
        "id": "simple_name_program",
        "label": "Name - Program #",
        "pattern": "{athlete} - Program {number}",
        "example": "Ed - Program 35",
    },
    {
        "id": "program_name",
        "label": "Program # - Name",
        "pattern": "Program {number} - {athlete}",
        "example": "Program 35 - Ed",
    },
    {
        "id": "name_block",
        "label": "Name - Block # - Theme",
        "pattern": "{athlete} - Block {number} - {theme}",
        "example": "Ed - Block 5 - Hypertrophy",
    },
    {
        "id": "name_only",
        "label": "Name's Program (any format after name)",
        "pattern": "{athlete}'s {any}",
        "example": "Ed's Peaking Block Week 1-4",
    },
]


_TOKEN_PATTERNS: dict[str, str] = {
    "athlete": r"(?P<athlete>.+?)",
    "number": r"(?P<number>\d+)",
    "dates": r"(?P<dates>\d{1,2}[/_.]\d{1,2}[/_.]\d{2,4}\s*[-\u2013\u2014]\s*\d{1,2}[/_.]\d{1,2}[/_.]\d{2,4})",
    "theme": r"(?P<theme>.+)",
    "any": r"(?:.*?)",
}


_SEPARATOR_CHARS = r"[-\u2013\u2014]"


def _escape_literal(text: str) -> str:
    """Escape literal text for regex, but make separators and punctuation flexible.

    Hyphens, en dashes, and em dashes are treated as interchangeable.
    Apostrophes and smart quotes are treated as interchangeable.
    Multiple spaces are collapsed.
    """

    text = re.sub(r"[-\u2013\u2014]", "__DASH__", text)

    text = re.sub(r"['\u2018\u2019\u0027\u2032]", "__APOS__", text)

    text = re.escape(text)

    text = text.replace("__DASH__", rf"\s*{_SEPARATOR_CHARS}\s*")

    text = text.replace("__APOS__", r"['\u2018\u2019\u0027\u2032]")

    text = re.sub(r"\\ +", r"\\s+", text)
    return text


def compile_pattern(template: str) -> re.Pattern:
    """Convert a template string into a compiled regex.

    Args:
        template: A string like "{athlete}'s Program {number} - ({dates}) - {theme}"

    Returns:
        A compiled regex with named capture groups for each token.

    Raises:
        ValueError: If the template contains unknown tokens.
    """

    token_re = re.compile(r"\{(\w+)\}")
    parts = token_re.split(template)


    regex_parts = []
    for i, part in enumerate(parts):
        if i % 2 == 0:

            if part:
                regex_parts.append(_escape_literal(part))
        else:

            if part not in _TOKEN_PATTERNS:
                raise ValueError(
                    f"Unknown token '{{{part}}}'. "
                    f"Valid tokens: {', '.join(f'{{{t}}}' for t in _TOKEN_PATTERNS)}"
                )
            regex_parts.append(_TOKEN_PATTERNS[part])

    full_pattern = "^" + "".join(regex_parts) + "$"
    return re.compile(full_pattern, re.IGNORECASE)


@dataclass
class ParsedFilename:
    """Result of parsing a filename against a naming pattern."""

    athlete: str | None = None
    number: int | None = None
    dates: str | None = None
    theme: str | None = None
    matched: bool = False

    def to_dict(self) -> dict:
        return {
            "athlete": self.athlete,
            "number": self.number,
            "dates": self.dates,
            "theme": self.theme,
            "matched": self.matched,
        }


def parse_filename(filename: str, template: str | None = None) -> ParsedFilename:
    """Parse a filename using the given naming pattern template.

    Args:
        filename: The sheet filename to parse (with or without .xlsx extension).
        template: The naming pattern template. Defaults to DEFAULT_PATTERN.

    Returns:
        ParsedFilename with extracted fields, or matched=False if no match.
    """
    if template is None:
        template = DEFAULT_PATTERN


    clean = re.sub(r"\.xlsx$", "", filename, flags=re.IGNORECASE).strip()


    clean = clean.replace("____", " - ")
    clean = re.sub(r"(?<!\d)__(?!\d)", " ", clean)
    clean = re.sub(r"(?<!\d)_(?!\d)", " ", clean)
    clean = clean.strip()

    try:
        pattern = compile_pattern(template)
    except ValueError:
        return ParsedFilename(matched=False)

    m = pattern.match(clean)
    if not m:
        return ParsedFilename(matched=False)

    result = ParsedFilename(matched=True)

    groups = m.groupdict()
    if "athlete" in groups:
        result.athlete = groups["athlete"].strip()
    if "number" in groups:
        try:
            result.number = int(groups["number"])
        except (ValueError, TypeError):
            pass
    if "dates" in groups:
        result.dates = groups["dates"].strip()
    if "theme" in groups:
        result.theme = groups["theme"].strip()

    return result


def extract_athlete_name(filename: str, template: str | None = None) -> str | None:
    """Convenience function: extract just the athlete name from a filename.

    Returns None if the filename doesn't match the pattern or has no athlete token.
    """
    result = parse_filename(filename, template)
    if result.matched and result.athlete:

        if 2 <= len(result.athlete) <= 50:
            return result.athlete
    return None


def preview_pattern(
    template: str,
    filenames: list[str],
) -> dict:
    """Test a naming pattern against a list of filenames.

    Returns a summary showing which files matched, what was extracted,
    and which didn't match. Used by the UI for real-time pattern testing.
    """
    matched = []
    unmatched = []

    for filename in filenames:
        result = parse_filename(filename, template)
        if result.matched:
            matched.append({
                "filename": filename,
                **result.to_dict(),
            })
        else:
            unmatched.append({"filename": filename})

    return {
        "template": template,
        "total": len(filenames),
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "matched": matched,
        "unmatched": unmatched,
    }
