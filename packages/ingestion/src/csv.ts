// Streaming CSV parser. It processes the input one chunk at a time and emits
// one row at a time through a callback, so the whole file is never held in
// memory. This is a hard requirement: real client extracts run to hundreds of
// thousands of rows and up to a hundred megabytes.
//
// The parser follows RFC 4180 conventions: fields may be quoted with double
// quotes, a quoted field may contain the delimiter, carriage returns and line
// feeds, and a literal double quote inside a quoted field is written as two
// double quotes. CRLF and LF line endings are both accepted.

import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export interface CsvParseOptions {
  /** Field delimiter. Defaults to a comma. */
  readonly delimiter?: string;
}

/**
 * Parse a readable stream of CSV as it arrives, invoking `onRow` once per
 * record with the field values and the zero-based row index. The returned
 * promise resolves when the stream ends and rejects if the stream errors.
 *
 * The parser holds at most the current record in memory, never the whole file.
 */
export function parseCsvStream(
  input: Readable,
  onRow: (row: string[], index: number) => void,
  options: CsvParseOptions = {},
): Promise<void> {
  const delimiter = options.delimiter ?? ',';
  const delimiterCode = delimiter.charCodeAt(0);
  const decoder = new StringDecoder('utf8');

  let field = '';
  let row: string[] = [];
  let index = 0;
  let inQuotes = false;
  // True when, inside a quoted field, we have just seen a double quote and are
  // waiting to see whether it closes the field or is an escaped quote. This
  // flag persists across chunk boundaries.
  let afterQuote = false;
  // True once any character of the current record has been seen, so a trailing
  // newline does not emit a spurious empty final record.
  let rowStarted = false;

  const consume = (text: string): void => {
    for (const c of text) {
      if (afterQuote) {
        afterQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        // Not an escaped quote: the quoted section has closed. Fall through and
        // process this character in the unquoted branch below.
        inQuotes = false;
      } else if (inQuotes) {
        if (c === '"') afterQuote = true;
        else field += c;
        continue;
      }

      // Unquoted handling.
      if (c === '"' && field === '') {
        inQuotes = true;
        rowStarted = true;
        continue;
      }
      if (c === delimiter || c.charCodeAt(0) === delimiterCode) {
        row.push(field);
        field = '';
        rowStarted = true;
        continue;
      }
      if (c === '\r') {
        // Swallow carriage returns; the line feed terminates the record.
        continue;
      }
      if (c === '\n') {
        row.push(field);
        onRow(row, index);
        index++;
        row = [];
        field = '';
        rowStarted = false;
        continue;
      }
      field += c;
      rowStarted = true;
    }
  };

  return new Promise<void>((resolve, reject) => {
    input.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      if (text.length > 0) consume(text);
    });
    input.on('error', reject);
    input.on('end', () => {
      const tail = decoder.end();
      if (tail.length > 0) consume(tail);
      // Flush a final record that was not terminated by a newline.
      if (rowStarted || field !== '' || row.length > 0) {
        row.push(field);
        onRow(row, index);
      }
      resolve();
    });
  });
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;

/**
 * Guess the field delimiter from a sample of the file by counting candidate
 * delimiters that occur outside quoted regions on the first non-empty line.
 * Falls back to a comma when there is nothing to go on.
 */
export function sniffDelimiter(sample: string): string {
  // Take the first line, respecting quotes so a quoted newline does not end it.
  let line = '';
  let inQuotes = false;
  for (const c of sample) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === '\n' && !inQuotes) break;
    if (c === '\r' && !inQuotes) continue;
    line += c;
  }

  const counts = new Map<string, number>();
  let quoted = false;
  for (const c of line) {
    if (c === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    for (const d of CANDIDATE_DELIMITERS) {
      if (c === d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }

  let best = ',';
  let bestCount = 0;
  for (const d of CANDIDATE_DELIMITERS) {
    const n = counts.get(d) ?? 0;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}
