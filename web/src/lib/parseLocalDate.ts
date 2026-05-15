const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse date strings, treating bare YYYY-MM-DD values as local midnight. */
export function parseLocalDate(s: string | null | undefined): Date | null {
  const value = s?.trim();
  if (!value) return null;

  const dateOnly = value.match(DATE_ONLY_RE);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);

  return isNaN(d.getTime()) ? null : d;
}

export default parseLocalDate;
