// Column type inference from a sample of values. Tolerant of blanks and of a
// small number of stray bad values, because real extracts always contain them.

export type InferredType = 'string' | 'number' | 'integer' | 'date' | 'boolean';

const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);
const INTEGER_RE = /^[+-]?\d+$/;
// A decimal number, tolerating thousands separators and a trailing percent or
// currency-free magnitude. Kept deliberately conservative.
const NUMBER_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

// Common date shapes. Day-and-month order is ambiguous and is not resolved
// here; we only decide whether the column is date-like.
const DATE_RES: RegExp[] = [
  /^\d{4}-\d{1,2}-\d{1,2}$/, // ISO 2020-01-31
  /^\d{4}\/\d{1,2}\/\d{1,2}$/, // 2020/01/31
  /^\d{1,2}\/\d{1,2}\/\d{4}$/, // 31/01/2020 or 01/31/2020
  /^\d{1,2}-\d{1,2}-\d{4}$/, // 31-01-2020
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, // ISO date-time
];

const THRESHOLD = 0.85;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function fractionMatching(values: string[], predicate: (v: string) => boolean): number {
  if (values.length === 0) return 0;
  let matched = 0;
  for (const v of values) if (predicate(v)) matched++;
  return matched / values.length;
}

function isBooleanValue(value: string): boolean {
  return BOOLEAN_VALUES.has(value.trim().toLowerCase());
}

function isIntegerValue(value: string): boolean {
  return INTEGER_RE.test(value.trim());
}

function isNumberValue(value: string): boolean {
  return NUMBER_RE.test(value.trim());
}

function isDateValue(value: string): boolean {
  const v = value.trim();
  return DATE_RES.some((re) => re.test(v));
}

/**
 * Infer the most specific type that at least `THRESHOLD` of the non-blank
 * sample values satisfy. Blanks are ignored. A column of only blanks, or with
 * no clear majority type, is reported as a string. Integer is preferred over
 * number, and boolean and date are recognised before the numeric fallbacks.
 */
export function inferColumnType(values: string[]): InferredType {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return 'string';

  if (fractionMatching(present, isBooleanValue) >= THRESHOLD) return 'boolean';
  if (fractionMatching(present, isIntegerValue) >= THRESHOLD) return 'integer';
  if (fractionMatching(present, isDateValue) >= THRESHOLD) return 'date';
  if (fractionMatching(present, isNumberValue) >= THRESHOLD) return 'number';

  return 'string';
}
