// Pure text utilities shared by the mapping heuristics and the deduplication
// matcher. No dependencies, no database, deterministic. British English.

/**
 * Normalise a raw header or value for comparison: lowercase, strip anything
 * that is not a letter or digit down to a single space, and collapse runs of
 * whitespace. So `Annual Base Sal (GBP)` becomes `annual base sal gbp` and
 * `MGR_PERNR` becomes `mgr pernr`.
 */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Split a normalised string into its non-empty tokens. */
export function tokenise(input: string): string[] {
  const n = normalise(input);
  return n.length === 0 ? [] : n.split(' ');
}

/**
 * Classic Levenshtein edit distance between two strings, computed with a single
 * rolling row so that memory is O(min length). Used for fuzzy header and value
 * comparison; never on whole files.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string to keep the row small.
  if (a.length > b.length) {
    const swap = a;
    a = b;
    b = swap;
  }

  const width = a.length + 1;
  const row: number[] = new Array<number>(width);
  for (let i = 0; i < width; i++) row[i] = i;

  for (let j = 1; j <= b.length; j++) {
    let previous = row[0] ?? 0; // diagonal (row[i-1] before overwrite)
    row[0] = j;
    const bChar = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const temp = row[i] ?? 0; // this becomes the diagonal for the next column
      const cost = a.charCodeAt(i - 1) === bChar ? 0 : 1;
      const deletion = (row[i] ?? 0) + 1;
      const insertion = (row[i - 1] ?? 0) + 1;
      const substitution = previous + cost;
      row[i] = Math.min(deletion, insertion, substitution);
      previous = temp;
    }
  }
  return row[a.length] ?? 0;
}

/**
 * Normalised similarity in the range 0..1 derived from edit distance, where 1
 * is an exact match and 0 is maximally different.
 */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Whether two individual tokens should be treated as the same concept. Exact
 * match, a shared prefix of at least three characters (so `sal` matches
 * `salary`), or a single edit apart for longer tokens (so `centre` matches
 * `center`).
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1) return true;
  return false;
}

/**
 * A token-overlap F1 score between two token lists using fuzzy token equality.
 * Recall is the fraction of the reference (synonym) tokens covered; precision is
 * the fraction of the candidate (header) tokens that are useful. The harmonic
 * mean rewards covering the synonym without being diluted by extra header
 * tokens too heavily.
 */
export function tokenF1(headerTokens: string[], synonymTokens: string[]): number {
  if (headerTokens.length === 0 || synonymTokens.length === 0) return 0;

  let matchedSynonym = 0;
  for (const s of synonymTokens) {
    if (headerTokens.some((h) => tokensMatch(h, s))) matchedSynonym++;
  }
  let matchedHeader = 0;
  for (const h of headerTokens) {
    if (synonymTokens.some((s) => tokensMatch(h, s))) matchedHeader++;
  }

  const recall = matchedSynonym / synonymTokens.length;
  const precision = matchedHeader / headerTokens.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}
