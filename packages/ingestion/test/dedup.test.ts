import { describe, it, expect } from 'vitest';
import { findDuplicates, type CanonicalRow } from '@wfb/ingestion';

/**
 * E04-03: fuzzy matching and deduplication. Every candidate is a review item;
 * nothing is ever merged automatically, because merging two genuinely distinct
 * employees is a serious data-integrity failure. All names and emails here are
 * obviously synthetic.
 */

const ROWS: CanonicalRow[] = [
  { external_id: 'E1', person_name: 'Ada Lovelace', email: 'ada.lovelace@example.test', person_external_id: '100' },
  { external_id: 'E2', person_name: 'Ada Lovelace', email: 'ada.lovelace@example.test', person_external_id: '100' },
  { external_id: 'E3', person_name: 'Adah Lovelace', email: 'ada.lovelace@example.test', person_external_id: '101' },
  { external_id: 'E4', person_name: 'Grace Hopper', email: 'grace.hopper@example.test', person_external_id: '200' },
  { external_id: 'E5', person_name: 'Katherine Johnson', email: 'k.johnson@example.test', person_external_id: '300' },
];

describe('findDuplicates', () => {
  it('surfaces near-duplicate rows as review items', () => {
    const items = findDuplicates(ROWS, ['person_name', 'email', 'person_external_id']);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const group = items[0];
    expect(group).toBeDefined();
    const ids = group!.candidates.map((c) => c.external_id).sort();
    // E1, E2 (identical) and E3 (fuzzy) refer to the same fictional person.
    expect(ids).toContain('E1');
    expect(ids).toContain('E2');
    expect(ids).toContain('E3');
  });

  it('recommends but never applies a merge', () => {
    const items = findDuplicates(ROWS, ['person_name', 'email']);
    for (const item of items) {
      expect(['merge', 'keep_both', 'reject']).toContain(item.suggestion);
      // A suggestion is advisory: the candidate rows are still present and
      // distinct, not collapsed into one.
      expect(item.candidates.length).toBeGreaterThanOrEqual(2);
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
    }
    // The identical pair should be a high-confidence merge recommendation.
    const top = items[0];
    expect(top).toBeDefined();
    expect(top!.suggestion).toBe('merge');
    expect(top!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('does not group genuinely distinct people', () => {
    const items = findDuplicates(ROWS, ['person_name', 'email', 'person_external_id']);
    const flattened = items.flatMap((i) => i.candidates.map((c) => c.external_id));
    // Grace and Katherine share nothing and must not appear in any group.
    expect(flattened).not.toContain('E4');
    expect(flattened).not.toContain('E5');
  });

  it('returns nothing when there is only one row or no keys', () => {
    expect(findDuplicates([ROWS[0]!], ['email'])).toEqual([]);
    expect(findDuplicates(ROWS, [])).toEqual([]);
  });

  it('reports which keys drove the match', () => {
    const items = findDuplicates(ROWS, ['person_name', 'email', 'person_external_id']);
    const top = items[0];
    expect(top).toBeDefined();
    expect(top!.matchedOn.length).toBeGreaterThan(0);
  });
});
