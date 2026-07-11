/**
 * Canonical model types. Every entity and relationship is effective-dated.
 * References between entities use external_id, the stable client-supplied key
 * (ADR 0003).
 */

/** Tables that are effective-dated entities or relationships (INV-4). */
export const TEMPORAL_TABLES = [
  'positions',
  'people',
  'occupancies',
  'reporting_lines',
  'locations',
  'cost_centres',
  'org_units',
  'job_families',
  'jobs',
  'roles',
  'skills',
  'activities',
  'role_positions',
  'position_skills',
  'person_skills',
  'demand_targets',
] as const;

export type TemporalTable = (typeof TEMPORAL_TABLES)[number];

export function isTemporalTable(name: string): name is TemporalTable {
  return (TEMPORAL_TABLES as readonly string[]).includes(name);
}

export interface TemporalFields {
  id: string;
  tenant_id: string;
  workspace_id: string;
  external_id: string;
  valid_from: Date;
  valid_to: Date | null;
  created_at: Date;
  custom: Record<string, unknown>;
}

export interface Position extends TemporalFields {
  title: string;
  grade: string | null;
  fte: string; // numeric arrives as string from pg
  status: string;
  cost_centre_external_id: string | null;
  location_external_id: string | null;
  org_unit_external_id: string | null;
  job_external_id: string | null;
  role_external_id: string | null;
}

export interface Person extends TemporalFields {
  display_name: string;
  email: string | null;
}

export interface ReportingLine extends TemporalFields {
  child_position_external_id: string;
  parent_position_external_id: string | null;
}

export interface Occupancy extends TemporalFields {
  person_external_id: string;
  position_external_id: string;
  fte: string;
}
