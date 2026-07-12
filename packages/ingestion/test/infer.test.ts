import { describe, it, expect } from 'vitest';
import { inferColumnType } from '@wfb/ingestion';

/** E04-01: type inference, tolerant of blanks and a few stray bad values. */
describe('inferColumnType', () => {
  it('infers integer', () => {
    expect(inferColumnType(['1', '2', '3', '-4', '100'])).toBe('integer');
  });

  it('infers number for decimals', () => {
    expect(inferColumnType(['1.5', '2.0', '3', '0.75'])).toBe('number');
  });

  it('infers date across common shapes', () => {
    expect(inferColumnType(['2020-01-31', '2021-12-01', ''])).toBe('date');
    expect(inferColumnType(['31/01/2020', '01/12/2021'])).toBe('date');
  });

  it('infers boolean', () => {
    expect(inferColumnType(['yes', 'no', 'yes', 'no'])).toBe('boolean');
    expect(inferColumnType(['true', 'false', 'true'])).toBe('boolean');
  });

  it('falls back to string for free text', () => {
    expect(inferColumnType(['alpha', 'beta', 'gamma'])).toBe('string');
  });

  it('ignores blanks when deciding', () => {
    expect(inferColumnType(['', '10', '', '20', ''])).toBe('integer');
  });

  it('tolerates a small number of bad values in a realistic sample', () => {
    const values = Array.from({ length: 20 }, (_v, i) => String(i));
    values.push('n/a'); // one stray bad value out of twenty-one
    expect(inferColumnType(values)).toBe('integer');
  });

  it('reports string for an all-blank column', () => {
    expect(inferColumnType(['', '  ', ''])).toBe('string');
  });
});
