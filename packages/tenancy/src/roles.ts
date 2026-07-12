/**
 * Role-based access control. Roles are enforced server side, in the database
 * through row-level security for data isolation, and here for action
 * authorisation. The user interface never enforces authorisation alone.
 */

export const ROLES = ['owner', 'administrator', 'designer', 'analyst', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Capabilities an action may require. */
export type Capability =
  | 'workspace:manage'
  | 'members:manage'
  | 'data:ingest'
  | 'scenario:edit'
  | 'scenario:read'
  | 'measure:read'
  | 'export:create';

const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set([
    'workspace:manage',
    'members:manage',
    'data:ingest',
    'scenario:edit',
    'scenario:read',
    'measure:read',
    'export:create',
  ]),
  administrator: new Set([
    'members:manage',
    'data:ingest',
    'scenario:edit',
    'scenario:read',
    'measure:read',
    'export:create',
  ]),
  designer: new Set([
    'data:ingest',
    'scenario:edit',
    'scenario:read',
    'measure:read',
    'export:create',
  ]),
  analyst: new Set(['scenario:read', 'measure:read', 'export:create']),
  viewer: new Set(['scenario:read', 'measure:read']),
};

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function assertCapability(role: Role, capability: Capability): void {
  if (!roleHasCapability(role, capability)) {
    throw new AuthorisationError(role, capability);
  }
}

export class AuthorisationError extends Error {
  constructor(
    readonly role: Role,
    readonly capability: Capability,
  ) {
    super(`Role '${role}' lacks capability '${capability}'`);
    this.name = 'AuthorisationError';
  }
}
