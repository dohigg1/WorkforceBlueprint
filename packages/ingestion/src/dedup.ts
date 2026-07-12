// Fuzzy deduplication. Configurable match keys, fuzzy comparison on name,
// email and identifier, and a confidence score. Every candidate becomes a human
// review item offering merge, keep both, or reject. We NEVER auto-merge:
// merging two genuinely distinct employees is a serious data-integrity failure,
// so a human always decides.

import { normalise, similarity } from './text.js';
import type { CanonicalRow } from './validate.js';

/** The row fields the matcher may compare on. */
export type MatchKey = 'person_name' | 'email' | 'external_id' | 'person_external_id';

export type Suggestion = 'merge' | 'keep_both' | 'reject';

export interface ReviewItem {
  /** The rows believed to refer to the same real entity. */
  readonly candidates: CanonicalRow[];
  /** A recommendation only. It is never applied automatically. */
  readonly suggestion: Suggestion;
  /** Combined confidence in the range 0..1. */
  readonly confidence: number;
  /** Which keys drove the match, for reviewer transparency. */
  readonly matchedOn: MatchKey[];
}

export interface DedupOptions {
  /** Pairs scoring at or above this are surfaced for review. Default 0.6. */
  readonly candidateFloor?: number;
  /** At or above this the recommendation is to merge. Default 0.9. */
  readonly mergeThreshold?: number;
  /** At or above this, but below merge, the recommendation is to keep both. Default 0.75. */
  readonly keepBothThreshold?: number;
}

const DEFAULT_OPTIONS: Required<DedupOptions> = {
  candidateFloor: 0.6,
  mergeThreshold: 0.9,
  keepBothThreshold: 0.75,
};

function fieldValue(row: CanonicalRow, key: MatchKey): string | null {
  const raw = row[key];
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length === 0 ? null : s;
}

function compareEmail(a: string, b: string): number {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na === nb) return 1;
  // Compare the local parts and domains separately so that a differing display
  // spelling of the same mailbox still scores well.
  const [la = na, da = ''] = na.split('@');
  const [lb = nb, db = ''] = nb.split('@');
  const local = similarity(la, lb);
  const domain = da === db ? 1 : similarity(da, db);
  return local * 0.7 + domain * 0.3;
}

function compareKey(key: MatchKey, a: string, b: string): number {
  if (key === 'email') return compareEmail(a, b);
  if (key === 'external_id' || key === 'person_external_id') {
    return normalise(a) === normalise(b) ? 1 : similarity(normalise(a), normalise(b));
  }
  // person_name
  return similarity(normalise(a), normalise(b));
}

function pairScore(
  a: CanonicalRow,
  b: CanonicalRow,
  keys: MatchKey[],
): { confidence: number; matchedOn: MatchKey[] } {
  let sum = 0;
  let used = 0;
  const matchedOn: MatchKey[] = [];
  for (const key of keys) {
    const va = fieldValue(a, key);
    const vb = fieldValue(b, key);
    if (va === null || vb === null) continue;
    const s = compareKey(key, va, vb);
    sum += s;
    used++;
    if (s >= 0.85) matchedOn.push(key);
  }
  if (used === 0) return { confidence: 0, matchedOn };
  return { confidence: sum / used, matchedOn };
}

function blockKey(row: CanonicalRow, keys: MatchKey[]): string {
  // A cheap blocking key to avoid comparing every row with every other on large
  // extracts: the first two characters of the first available match value.
  for (const key of keys) {
    const v = fieldValue(row, key);
    if (v !== null) return normalise(v).slice(0, 2);
  }
  return '';
}

function suggestionFor(confidence: number, opts: Required<DedupOptions>): Suggestion {
  if (confidence >= opts.mergeThreshold) return 'merge';
  if (confidence >= opts.keepBothThreshold) return 'keep_both';
  return 'reject';
}

/**
 * Find likely duplicate rows on the given match keys and return a review queue.
 * Rows are grouped by transitive connection: if A matches B and B matches C,
 * the three are offered as one review item. The suggestion is advisory and the
 * item always requires a human decision; nothing is merged here.
 */
export function findDuplicates(
  rows: CanonicalRow[],
  keys: MatchKey[],
  options: DedupOptions = {},
): ReviewItem[] {
  const opts: Required<DedupOptions> = { ...DEFAULT_OPTIONS, ...options };
  if (keys.length === 0 || rows.length < 2) return [];

  // Block rows so we only compare within a block, then union matching pairs.
  const blocks = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const bk = blockKey(row, keys);
    const list = blocks.get(bk) ?? [];
    list.push(i);
    blocks.set(bk, list);
  });

  const parent = new Array<number>(rows.length);
  for (let i = 0; i < rows.length; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r] as number;
    let c = x;
    while (parent[c] !== r) {
      const next = parent[c] as number;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Best pairwise confidence and matched keys recorded per union member so the
  // group confidence reflects the strongest evidence found.
  const bestConfidence = new Map<number, number>();
  const matchedKeys = new Map<number, Set<MatchKey>>();

  for (const idxs of blocks.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x] as number;
        const j = idxs[y] as number;
        const rowI = rows[i] as CanonicalRow;
        const rowJ = rows[j] as CanonicalRow;
        const { confidence, matchedOn } = pairScore(rowI, rowJ, keys);
        if (confidence >= opts.candidateFloor) {
          union(i, j);
          for (const member of [i, j]) {
            if (confidence > (bestConfidence.get(member) ?? 0)) bestConfidence.set(member, confidence);
            const set = matchedKeys.get(member) ?? new Set<MatchKey>();
            for (const k of matchedOn) set.add(k);
            matchedKeys.set(member, set);
          }
        }
      }
    }
  }

  // Assemble groups of size two or more.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    if (bestConfidence.has(i)) {
      const root = find(i);
      const list = groups.get(root) ?? [];
      list.push(i);
      groups.set(root, list);
    }
  }

  const items: ReviewItem[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let confidence = 0;
    const matched = new Set<MatchKey>();
    for (const m of members) {
      confidence = Math.max(confidence, bestConfidence.get(m) ?? 0);
      for (const k of matchedKeys.get(m) ?? []) matched.add(k);
    }
    items.push({
      candidates: members.map((m) => rows[m] as CanonicalRow),
      suggestion: suggestionFor(confidence, opts),
      confidence: Number(confidence.toFixed(3)),
      matchedOn: [...matched],
    });
  }

  // Strongest matches first so a reviewer clears the clear cases quickly.
  items.sort((a, b) => b.confidence - a.confidence);
  return items;
}
