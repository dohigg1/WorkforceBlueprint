/**
 * The semantic tool layer (INV-8). The language model NEVER emits structured
 * query language. It composes measures through this constrained tool schema.
 * Every tool call is validated against the schema, parameterised and, at
 * execution time, tenant-scoped from the session. There is deliberately NO
 * tenant or workspace parameter here: identity can never be supplied by the
 * model, only by the verified session.
 *
 * This package holds no database client (enforced by the lint rule
 * wfb/no-db-in-ai); it produces structured tool calls that a separate,
 * tenant-scoped execution layer runs through the measure engine.
 */

export const ALLOWED_MEASURES = [
  'headcount',
  'filled_headcount',
  'vacancies',
  'fte',
  'average_span',
  'management_ratio',
  'layers',
  'cost',
  'base_cost',
  'cost_per_head',
] as const;
export type AllowedMeasure = (typeof ALLOWED_MEASURES)[number];

export const ALLOWED_SCOPES = ['organisation', 'subtree', 'org_unit', 'node'] as const;
export type AllowedScope = (typeof ALLOWED_SCOPES)[number];

export type ToolCall =
  | { tool: 'list_measures' }
  | {
      tool: 'evaluate_measure';
      measure: AllowedMeasure;
      scope: AllowedScope;
      anchor?: string;
      scenario?: string;
    }
  | { tool: 'compare_scenario'; scenario: string; measure: AllowedMeasure };

/** A machine-readable description of the tool schema, for a model prompt. */
export const TOOL_SCHEMA = {
  tools: [
    { name: 'list_measures', description: 'List the measures available.' },
    {
      name: 'evaluate_measure',
      description: 'Evaluate one registered measure over a scope, in a scenario.',
      parameters: {
        measure: { enum: ALLOWED_MEASURES },
        scope: { enum: ALLOWED_SCOPES },
        anchor: { type: 'string', description: 'External id for subtree/org_unit/node scope.' },
        scenario: { type: 'string', description: 'Scenario id or "baseline".' },
      },
    },
    {
      name: 'compare_scenario',
      description: 'Compare a scenario against the baseline for one measure.',
      parameters: { scenario: { type: 'string' }, measure: { enum: ALLOWED_MEASURES } },
    },
  ],
} as const;
