import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { parseCsvStream, sniffDelimiter } from '@wfb/ingestion';

/**
 * E04-01: streaming parse. Quoted fields, embedded commas and newlines, escaped
 * quotes and CRLF must all be handled, and the parser must never buffer the
 * whole file. All data here is obviously synthetic.
 */

async function collect(text: string, delimiter?: string): Promise<string[][]> {
  const rows: string[][] = [];
  const chunks = Buffer.from(text, 'utf8');
  // Feed the bytes in deliberately awkward small slices so that quotes, escaped
  // quotes and CRLF pairs straddle chunk boundaries.
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i += 3) parts.push(chunks.subarray(i, i + 3));
  await parseCsvStream(
    Readable.from(parts),
    (row) => rows.push(row),
    delimiter ? { delimiter } : {},
  );
  return rows;
}

describe('parseCsvStream', () => {
  it('parses quoted fields with embedded commas and escaped quotes', async () => {
    const rows = await collect('id,note\r\n1,"hello, world"\r\n2,"she said ""hi"""\r\n');
    expect(rows).toEqual([
      ['id', 'note'],
      ['1', 'hello, world'],
      ['2', 'she said "hi"'],
    ]);
  });

  it('parses a field containing embedded newlines', async () => {
    const rows = await collect('id,note\n1,"line one\nline two"\n');
    expect(rows).toEqual([
      ['id', 'note'],
      ['1', 'line one\nline two'],
    ]);
  });

  it('accepts a final record with no trailing newline', async () => {
    const rows = await collect('a,b\n1,2');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not emit a spurious empty record for a trailing newline', async () => {
    const rows = await collect('a,b\n1,2\n');
    expect(rows).toHaveLength(2);
  });

  it('reports the zero-based row index', async () => {
    const seen: number[] = [];
    await parseCsvStream(Readable.from([Buffer.from('a\nb\nc\n')]), (_row, i) => seen.push(i));
    expect(seen).toEqual([0, 1, 2]);
  });

  it('honours an alternative delimiter', async () => {
    const rows = await collect('a;b;c\n1;2;3\n', ';');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles a large stream one record at a time without buffering the file', async () => {
    // Generate many rows lazily so the source never materialises the whole file.
    const count = 50_000;
    function* lines(): Generator<string> {
      yield 'id,value\n';
      for (let i = 0; i < count; i++) yield `${i},"v,${i}"\n`;
    }
    let rowCount = 0;
    let lastFirst = '';
    await parseCsvStream(Readable.from(lines()), (row) => {
      rowCount++;
      lastFirst = row[0] ?? '';
    });
    expect(rowCount).toBe(count + 1);
    expect(lastFirst).toBe(String(count - 1));
  });
});

describe('sniffDelimiter', () => {
  it('detects a comma, semicolon, tab and pipe', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(sniffDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(sniffDelimiter('a|b|c\n1|2|3')).toBe('|');
  });

  it('ignores delimiters inside quoted fields', () => {
    expect(sniffDelimiter('name;note\n"a;b;c;d;e";x')).toBe(';');
  });

  it('falls back to a comma when nothing is obvious', () => {
    expect(sniffDelimiter('single')).toBe(',');
  });
});
