/**
 * The board-pack model. The presentation and export layer turns any measure,
 * chart or comparison into PowerPoint and Excel. The caller assembles this model
 * from the measure engine; this package holds no calculation and no database.
 */

export interface StructureSummary {
  headcount: number;
  fte: number;
  layers: number;
  averageSpan: number;
  vacancies: number;
}

export interface CostSummary {
  loaded: number;
  perHead: number;
  currency: string;
}

export interface DivisionRow {
  division: string;
  headcount: number;
  averageSpan: number;
}

export interface ComparisonRow {
  measure: string;
  baseline: number;
  scenario: number;
}

export interface ExceptionRow {
  code: string;
  count: number;
}

export interface BoardPackModel {
  workspaceName: string;
  asAt: string;
  structure: StructureSummary;
  cost: CostSummary;
  divisions: DivisionRow[];
  comparison?: { scenarioName: string; rows: ComparisonRow[] };
  exceptions: ExceptionRow[];
}
