import { ALLOWED_MEASURES, ALLOWED_SCOPES, type ToolCall } from './schema.js';

/**
 * Validate a tool call against the constrained schema. Anything that is not an
 * exact, expected shape is rejected. This is the barrier that converts an
 * unbounded risk (free text to query) into a bounded one: no call escapes the
 * schema, no anchor carries anything but a safe identifier, and no call ever
 * carries tenant identity.
 */

const SAFE_ANCHOR = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_SCENARIO = /^(baseline|[0-9a-fA-F-]{36})$/;
const FORBIDDEN_KEYS = new Set(['tenant', 'tenantId', 'workspace', 'workspaceId', 'sql', 'query', 'where']);

export interface Validation {
  ok: boolean;
  errors: string[];
}

export function validateToolCall(call: unknown): Validation {
  const errors: string[] = [];
  if (typeof call !== 'object' || call === null) {
    return { ok: false, errors: ['not an object'] };
  }
  const c = call as Record<string, unknown>;

  for (const key of Object.keys(c)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(`forbidden key '${key}' (identity comes from the session, never the model)`);
  }

  switch (c['tool']) {
    case 'list_measures':
      break;
    case 'evaluate_measure':
      if (!ALLOWED_MEASURES.includes(c['measure'] as never)) errors.push(`unknown measure '${String(c['measure'])}'`);
      if (!ALLOWED_SCOPES.includes(c['scope'] as never)) errors.push(`unknown scope '${String(c['scope'])}'`);
      if (c['anchor'] !== undefined && !SAFE_ANCHOR.test(String(c['anchor']))) errors.push('unsafe anchor');
      if (c['scenario'] !== undefined && !SAFE_SCENARIO.test(String(c['scenario']))) errors.push('unsafe scenario');
      if ((c['scope'] === 'subtree' || c['scope'] === 'org_unit' || c['scope'] === 'node') && c['anchor'] === undefined) {
        errors.push('scope requires an anchor');
      }
      break;
    case 'compare_scenario':
      if (!ALLOWED_MEASURES.includes(c['measure'] as never)) errors.push(`unknown measure '${String(c['measure'])}'`);
      if (!SAFE_SCENARIO.test(String(c['scenario']))) errors.push('unsafe scenario');
      break;
    default:
      errors.push(`unknown tool '${String(c['tool'])}'`);
  }
  return { ok: errors.length === 0, errors };
}

export function isValidToolCall(call: unknown): call is ToolCall {
  return validateToolCall(call).ok;
}
