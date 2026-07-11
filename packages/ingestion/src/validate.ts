// Validation of a mapped extract. Validation is ADVISORY, never blocking: real
// client data always contains orphans, cycles and gaps, and a tool that refuses
// to load imperfect data is useless in a consulting context. We flag defects,
// score data quality out of one hundred, and produce a downloadable exception
// list, but we never reject the load.

export type Severity = 'info' | 'warning' | 'error';

/**
 * A canonical row after mapping. Every field except the position key is
 * optional because real extracts are incomplete. The position key is
 * `external_id`; `manager_external_id` is the parent position in the reporting
 * hierarchy, which is a hierarchy of positions, not of people.
 */
export interface CanonicalRow {
  readonly external_id: string;
  readonly title?: string;
  readonly grade?: string;
  readonly fte?: number | null;
  readonly status?: string;
  readonly cost_centre_external_id?: string | null;
  readonly location_external_id?: string | null;
  readonly org_unit_external_id?: string | null;
  readonly manager_external_id?: string | null;
  readonly person_external_id?: string | null;
  readonly person_name?: string;
  readonly email?: string;
  readonly base_salary?: number | null;
  /** Zero-based source row reference for exception reporting. */
  readonly rowIndex?: number;
}

export type ExceptionCode =
  | 'duplicate_external_id'
  | 'orphan_manager'
  | 'cycle'
  | 'non_positive_fte'
  | 'missing_cost_centre'
  | 'salary_outlier';

export interface ValidationException {
  readonly code: ExceptionCode;
  readonly severity: Severity;
  /** The offending row's `external_id`. */
  readonly externalId: string;
  /** The offending row's source index, when known. */
  readonly rowIndex: number | null;
  readonly message: string;
}

export interface ValidationReport {
  /** Data quality score out of one hundred. Higher is cleaner. */
  readonly score: number;
  readonly rowCount: number;
  readonly exceptions: ValidationException[];
  /** Count of exceptions by defect class, for a summary panel. */
  readonly countsByCode: Record<ExceptionCode, number>;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { error: 1, warning: 0.5, info: 0.2 };

function blank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

function detectCycles(rows: CanonicalRow[], present: Set<string>): Set<string> {
  // Build the child -> parent map for the manager graph, restricted to
  // managers that actually exist (orphans are reported separately, not as
  // cycles). Then find every node that lies on a cycle.
  const parentOf = new Map<string, string>();
  for (const r of rows) {
    if (!blank(r.manager_external_id) && present.has(r.manager_external_id as string)) {
      parentOf.set(r.external_id, r.manager_external_id as string);
    }
  }

  const onCycle = new Set<string>();
  // 0 = unvisited, 1 = on current path, 2 = settled.
  const state = new Map<string, number>();

  for (const start of parentOf.keys()) {
    if ((state.get(start) ?? 0) !== 0) continue;
    const path: string[] = [];
    let node: string | undefined = start;
    while (node !== undefined && (state.get(node) ?? 0) === 0) {
      state.set(node, 1);
      path.push(node);
      node = parentOf.get(node);
    }
    if (node !== undefined && (state.get(node) ?? 0) === 1) {
      // Found a back edge into the current path: everything from `node` onward
      // in `path` is on the cycle.
      const from = path.indexOf(node);
      for (let i = from; i < path.length; i++) {
        const n = path[i];
        if (n !== undefined) onCycle.add(n);
      }
    }
    for (const n of path) state.set(n, 2);
  }
  return onCycle;
}

function detectSalaryOutliers(rows: CanonicalRow[]): Set<CanonicalRow> {
  // Group salaries by grade and flag values beyond roughly three standard
  // deviations within their grade. A grade needs at least four salaried rows
  // before an outlier judgement is meaningful.
  const byGrade = new Map<string, CanonicalRow[]>();
  for (const r of rows) {
    if (r.base_salary === null || r.base_salary === undefined) continue;
    const grade = blank(r.grade) ? '__ungraded__' : (r.grade as string);
    const list = byGrade.get(grade) ?? [];
    list.push(r);
    byGrade.set(grade, list);
  }

  const outliers = new Set<CanonicalRow>();
  for (const list of byGrade.values()) {
    if (list.length < 4) continue;
    const salaries = list.map((r) => r.base_salary as number);
    const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
    const variance = salaries.reduce((a, b) => a + (b - mean) ** 2, 0) / salaries.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    for (const r of list) {
      if (Math.abs((r.base_salary as number) - mean) > 3 * std) outliers.add(r);
    }
  }
  return outliers;
}

/**
 * Validate a mapped extract and return an advisory report. Never throws for
 * data defects; a malformed row is a finding, not an exception in the control
 * flow.
 */
export function validate(rows: CanonicalRow[]): ValidationReport {
  const exceptions: ValidationException[] = [];
  const present = new Set<string>();
  for (const r of rows) present.add(r.external_id);

  const rowIndexOf = (r: CanonicalRow): number | null => r.rowIndex ?? null;

  // Duplicate external identifiers.
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.external_id, (seen.get(r.external_id) ?? 0) + 1);
  for (const r of rows) {
    if ((seen.get(r.external_id) ?? 0) > 1) {
      exceptions.push({
        code: 'duplicate_external_id',
        severity: 'error',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" appears more than once. Identifiers must be unique.`,
      });
    }
  }

  // Orphans: a manager reference that is not itself a present position.
  for (const r of rows) {
    if (!blank(r.manager_external_id) && !present.has(r.manager_external_id as string)) {
      exceptions.push({
        code: 'orphan_manager',
        severity: 'warning',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" reports to "${r.manager_external_id}", which is not present in the file.`,
      });
    }
  }

  // Cycles in the manager graph.
  const onCycle = detectCycles(rows, present);
  for (const r of rows) {
    if (onCycle.has(r.external_id)) {
      exceptions.push({
        code: 'cycle',
        severity: 'error',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" is part of a reporting cycle and cannot form a valid hierarchy.`,
      });
    }
  }

  // Non-positive full-time equivalent.
  for (const r of rows) {
    if (r.fte !== null && r.fte !== undefined && r.fte <= 0) {
      exceptions.push({
        code: 'non_positive_fte',
        severity: 'warning',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" has a full-time equivalent of ${r.fte}, which must be greater than zero.`,
      });
    }
  }

  // Positions without a cost centre.
  for (const r of rows) {
    if (blank(r.cost_centre_external_id)) {
      exceptions.push({
        code: 'missing_cost_centre',
        severity: 'warning',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" has no cost centre. It still costs money and needs one.`,
      });
    }
  }

  // Salary outliers by grade.
  const outliers = detectSalaryOutliers(rows);
  for (const r of rows) {
    if (outliers.has(r)) {
      exceptions.push({
        code: 'salary_outlier',
        severity: 'info',
        externalId: r.external_id,
        rowIndex: rowIndexOf(r),
        message: `Position "${r.external_id}" has a base salary that is unusual for its grade. Please check it.`,
      });
    }
  }

  const countsByCode: Record<ExceptionCode, number> = {
    duplicate_external_id: 0,
    orphan_manager: 0,
    cycle: 0,
    non_positive_fte: 0,
    missing_cost_centre: 0,
    salary_outlier: 0,
  };
  for (const e of exceptions) countsByCode[e.code]++;

  // Score: for each row, take the heaviest severity flagged against it and
  // subtract its weight from a clean baseline. This keeps the score stable
  // across dataset sizes and never rewards a defect.
  const worstBySever = new Map<string, number>();
  for (const e of exceptions) {
    const key = `${e.externalId}#${e.rowIndex ?? ''}`;
    const w = SEVERITY_WEIGHT[e.severity];
    if (w > (worstBySever.get(key) ?? 0)) worstBySever.set(key, w);
  }
  let weightedFlagged = 0;
  for (const w of worstBySever.values()) weightedFlagged += w;
  const rowCount = rows.length;
  const score =
    rowCount === 0 ? 100 : Math.max(0, Math.round(100 * (1 - weightedFlagged / rowCount)));

  return { score, rowCount, exceptions, countsByCode };
}
