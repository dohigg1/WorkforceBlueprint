// Thin typed client over the Workforce Blueprint HTTP API. The dev session is a
// cookie set by /auth/dev-login, so every request sends credentials. Identity
// is never passed in the body or query; only the read scenario and as-at date
// are (INV-2 is enforced server side).

export const BASELINE = 'baseline';

export interface Me {
  authenticated: boolean;
  role?: string;
  workspaceId?: string;
}

export interface TreeNode {
  id: string;
  title: string;
  grade: string | null;
  division: string | null;
  parent: string | null;
  vacant: boolean;
  fte: number;
  span: number;
  layer: number;
  descendants: number;
  x: number;
  y: number;
  // Per-node fully loaded cost, present when the reader is permitted to see it
  // (the static demo is an owner). Absent in live reads that do not project it.
  cost?: number | null;
}

export interface TreeResponse {
  nodes: TreeNode[];
  truncated: boolean;
}

export type Measures = Record<string, number>;

export interface Scenario {
  id: string;
  name: string;
  parent_scenario_id: string | null;
}

export interface CompareResponse {
  baseline: Measures;
  scenario: Measures;
}

export interface CostDecomposition {
  externalId: string;
  currency: string;
  base: number | null;
  onCosts: number | null;
  benefits: number | null;
  bonus: number | null;
  overhead: number | null;
  loaded: number | null;
  isVacant: boolean;
  masked: boolean;
}

export interface MappingProposal {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  explanation: string;
}

export interface ValidationException {
  code: string;
  severity: string;
  externalId: string;
  rowIndex: number | null;
  message: string;
}

export interface ValidationReport {
  score: number;
  rowCount: number;
  exceptions: ValidationException[];
  countsByCode: Record<string, number>;
}

export interface IngestResult {
  headers: string[];
  sampleRows: string[][];
  mapping: MappingProposal[];
  validation: ValidationReport;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ? `: ${body.message}` : '';
    } catch {
      /* no JSON body */
    }
    throw new Error(`${res.status} ${res.statusText}${detail}`);
  }
  return (await res.json()) as T;
}

// Scenario query parameter: omit for the baseline read.
function scenarioParam(scenarioId: string): string {
  return scenarioId && scenarioId !== BASELINE ? `?scenario=${encodeURIComponent(scenarioId)}` : '';
}

const liveApi = {
  me: () => request<Me>('/auth/me'),
  devLogin: () =>
    request<{ tenantId: string; workspaceId: string; role: string }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ workspace: 'demo' }),
    }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  tree: (scenarioId: string) => request<TreeResponse>(`/api/tree${scenarioParam(scenarioId)}`),
  measures: (scenarioId: string) => request<Measures>(`/api/measures${scenarioParam(scenarioId)}`),
  scenarios: () => request<Scenario[]>('/api/scenarios'),
  createScenario: (name: string, parent?: string) =>
    request<{ id: string }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(parent ? { name, parent } : { name }),
    }),
  compare: (scenarioId: string) =>
    request<CompareResponse>(`/api/scenarios/${encodeURIComponent(scenarioId)}/compare`),
  decompose: (externalId: string, scenarioId: string) =>
    request<CostDecomposition>(
      `/api/cost/${encodeURIComponent(externalId)}/decompose${scenarioParam(scenarioId)}`,
    ),
  reparent: (scenarioId: string, childId: string, newParentId: string) =>
    request<{ ok: boolean; rebuilt: number }>(
      `/api/scenarios/${encodeURIComponent(scenarioId)}/edit`,
      {
        method: 'POST',
        body: JSON.stringify({
          edits: [
            {
              table: 'reporting_lines',
              externalId: `RL-${childId}`,
              op: 'upsert',
              overrides: { parent_position_external_id: newParentId },
            },
          ],
        }),
      },
    ),
  analyze: (csv: string) =>
    request<IngestResult>('/api/ingest/analyze', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
};

// Static demo mode. When a baked data bundle is present on the window (used for
// the shareable single-file build), every call resolves from it and no network
// request is made. The live application never sets this global.
interface StaticBundle {
  me: Me;
  scenarios: Scenario[];
  scenarioId: string;
  baseline: { tree: TreeResponse; measures: Measures };
  scenario: { tree: TreeResponse; measures: Measures; compare: CompareResponse };
  decompose: Record<string, CostDecomposition>;
  analyze: IngestResult;
  sampleCsv: string;
}

function staticApi(s: StaticBundle): typeof liveApi {
  const R = <T>(v: T): Promise<T> => Promise.resolve(v);
  const isScenario = (id: string): boolean => Boolean(id) && id !== BASELINE;
  return {
    me: () => R(s.me),
    devLogin: () => R({ tenantId: 'demo', workspaceId: 'demo', role: 'owner' }),
    logout: () => R({ ok: true as const }),
    tree: (id: string) => R(isScenario(id) ? s.scenario.tree : s.baseline.tree),
    measures: (id: string) => R(isScenario(id) ? s.scenario.measures : s.baseline.measures),
    scenarios: () => R(s.scenarios),
    createScenario: () => R({ id: s.scenarioId }),
    compare: () => R(s.scenario.compare),
    decompose: (externalId: string) =>
      R(s.decompose[externalId] ?? { externalId, currency: 'GBP', base: null, onCosts: null, benefits: null, bonus: null, overhead: null, loaded: null, isVacant: false, masked: true }),
    reparent: () => R({ ok: true, rebuilt: 0 }),
    analyze: () => R(s.analyze),
  };
}

declare global {
  interface Window {
    __WFB_STATIC__?: StaticBundle;
  }
}

export const api: typeof liveApi =
  typeof window !== 'undefined' && window.__WFB_STATIC__ ? staticApi(window.__WFB_STATIC__) : liveApi;

export const STATIC_SAMPLE_CSV: string | undefined =
  typeof window !== 'undefined' ? window.__WFB_STATIC__?.sampleCsv : undefined;

export const MEASURE_LABELS: Record<string, string> = {
  headcount: 'Headcount',
  filled_headcount: 'Filled',
  vacancies: 'Vacancies',
  fte: 'Full-time equivalent',
  average_span: 'Average span',
  management_ratio: 'Management ratio',
  layers: 'Layers',
  cost: 'Loaded cost',
  base_cost: 'Base cost',
  cost_per_head: 'Cost per head',
};

export function fmt(n: number, digits = 0): string {
  return Number(n).toLocaleString('en-GB', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function fmtMoney(n: number, currency = 'GBP'): string {
  return Number(n).toLocaleString('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}
