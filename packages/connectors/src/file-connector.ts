// The file connector, kind 'file'. It reads a delimited extract and returns its
// headers and rows. In this build the file arrives in the connection config as
// an in-memory CSV string (config.csv), which keeps the connector fully
// testable without a network. In production the secure file transfer variant
// would open an SFTP connection and stream the remote file into the same
// parseCsvStream call; the parse-and-return contract is identical, so only the
// byte source changes. The connector is READ-ONLY: it fetches, it never writes.

import { Readable } from 'node:stream';
import { parseCsvStream, sniffDelimiter } from '@wfb/ingestion';
import type { Connector } from './framework.js';

/** The file connector's configuration: an in-memory CSV payload. */
export interface FileConnectorConfig {
  readonly csv: string;
}

function readCsv(config: Record<string, unknown>): string | null {
  const csv = config['csv'];
  return typeof csv === 'string' ? csv : null;
}

export const fileConnector: Connector = {
  kind: 'file',
  async fetch(config: Record<string, unknown>): Promise<{ headers: string[]; rows: string[][] }> {
    const csv = readCsv(config);
    if (csv === null) {
      throw new Error(
        'The file connector needs a string `csv` in its configuration. A real secure ' +
          'file transfer connector would stream the remote file here instead.',
      );
    }

    // In production this Readable would be the SFTP download stream rather than
    // a string; parseCsvStream consumes either the same way and never holds the
    // whole file in memory.
    const delimiter = sniffDelimiter(csv);
    const records: string[][] = [];
    await parseCsvStream(
      Readable.from([csv]),
      (row) => {
        records.push(row);
      },
      { delimiter },
    );

    const headers = records[0] ?? [];
    const rows = records.slice(1);
    return { headers, rows };
  },
};
