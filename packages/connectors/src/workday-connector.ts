// The Workday connector, kind 'workday'. This is a STUB and is the framework's
// extension point, not a working integration. A real implementation would call
// a Workday Report-as-a-Service (RaaS) endpoint with tenant-scoped credentials
// and stream the report rows back through the same read-only fetch contract.
// Building that is OUT OF SCOPE for this sprint: its presence here demonstrates
// that adding a source is a matter of implementing Connector and registering
// it, with no change to the framework or the ingestion pipeline.

import type { Connector } from './framework.js';

export const workdayConnector: Connector = {
  kind: 'workday',
  fetch(): Promise<{ headers: string[]; rows: string[][] }> {
    throw new Error(
      'The Workday connector is not yet implemented; it requires Workday RaaS ' +
        'credentials and a configured report endpoint. It is registered as the ' +
        'framework extension point only.',
    );
  },
};
