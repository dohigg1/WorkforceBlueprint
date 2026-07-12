import jwt from 'jsonwebtoken';
import type { Role } from '@wfb/tenancy';

/**
 * Session tokens. The session is the ONLY source of tenant identity (INV-2):
 * the tenant, workspace, user and role are carried in a signed token and read
 * exclusively here and in the auth middleware, never from a request parameter.
 */

export const SESSION_COOKIE = 'wfb_session';
const SECRET = process.env.WFB_SESSION_SECRET ?? 'dev-only-secret-change-me';

export interface SessionClaims {
  tenantId: string;
  workspaceId: string;
  userId: string;
  role: Role;
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, SECRET, { expiresIn: '12h' });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, SECRET) as SessionClaims;
    return decoded;
  } catch {
    return null;
  }
}
