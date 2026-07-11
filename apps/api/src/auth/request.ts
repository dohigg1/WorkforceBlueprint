import type { Request } from 'express';
import type { TenantContext } from '@wfb/tenancy';

/** An Express request carrying the session-derived tenant context (INV-2). */
export type AuthedRequest = Request & { wfb?: TenantContext };
