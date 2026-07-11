import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BASELINE } from './api.ts';
import type { TreeNode } from './api.ts';
import { OrgChart } from './components/OrgChart.tsx';
import type { ColourMode } from './components/OrgChart.tsx';
import { Inspector } from './components/Inspector.tsx';
import { MeasuresView } from './components/MeasuresView.tsx';
import { ScenarioView } from './components/ScenarioView.tsx';
import { IngestionView } from './components/IngestionView.tsx';
import { Overview } from './components/Overview.tsx';

type Tab = 'overview' | 'structure' | 'measures' | 'scenario' | 'ingestion';

// Compact inline icons. The main organisation chart is canvas, never SVG; these
// are interface chrome, where vector marks are the right tool.
function Icon({ d }: { d: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const ICONS: Record<Tab, string> = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  structure: 'M9 3h6v4H9V3ZM3 17h6v4H3v-4Zm12 0h6v4h-6v-4ZM12 7v4M6 17v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3',
  measures: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  scenario: 'M6 3v12a3 3 0 0 0 3 3h6M6 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 0V9a2 2 0 0 0-2-2h-4',
  ingestion: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
};

const TABS: { id: Tab; label: string; group: 'main' | 'analyse' }[] = [
  { id: 'overview', label: 'Overview', group: 'main' },
  { id: 'structure', label: 'Org chart', group: 'main' },
  { id: 'measures', label: 'Measures', group: 'analyse' },
  { id: 'scenario', label: 'Scenarios', group: 'analyse' },
  { id: 'ingestion', label: 'Ingestion', group: 'analyse' },
];

const HEADERS: Record<Tab, [string, string, string]> = {
  overview: [
    'Workspace',
    'Overview',
    'The size, cost and shape of the organisation at a glance, every figure read live from the one measure engine.',
  ],
  structure: [
    'Position hierarchy',
    'Org chart',
    'The hierarchy of positions, laid out server side and rendered on canvas. Click any position to inspect its measures and cost.',
  ],
  measures: [
    'Measure engine',
    'Measures',
    'Headcount, full-time equivalent, span, layers and loaded cost. One engine, evaluated over the organisation scope.',
  ],
  scenario: [
    'Scenario overlay',
    'Scenarios and comparison',
    'Model a restructure as a copy-on-write overlay, then compare it against the untouched baseline.',
  ],
  ingestion: [
    'Ingestion',
    'Map and validate an extract',
    'Paste a messy HR spreadsheet. The semantic layer proposes a canonical mapping and scores data quality.',
  ],
};

function LoginGate({ onDone }: { onDone: () => void }): JSX.Element {
  const login = useMutation({ mutationFn: () => api.devLogin(), onSuccess: onDone });
  return (
    <div className="gate">
      <div className="card">
        <div className="mark">WB</div>
        <h1>Workforce Blueprint</h1>
        <p>
          A validated, costed, navigable organisation from a messy spreadsheet, in under an hour and
          without a consultant. Enter the seeded demo workspace to explore the live engines.
        </p>
        <button className="btn" disabled={login.isPending} onClick={() => login.mutate()}>
          {login.isPending ? 'Entering…' : 'Enter demo workspace'}
        </button>
        {login.isError && (
          <div className="msg err" style={{ marginTop: 14 }}>
            {(login.error as Error).message}
          </div>
        )}
        <div className="trust">
          <span><i />Row-level security</span>
          <span><i />Effective dated</span>
          <span><i />Synthetic data</span>
        </div>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [scenarioId, setScenarioId] = useState<string>(BASELINE);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [colourMode, setColourMode] = useState<ColourMode>('division');
  const [fitToken, setFitToken] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light' | null>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

  const authed = me.data?.authenticated === true;

  const tree = useQuery({
    queryKey: ['tree', scenarioId],
    queryFn: () => api.tree(scenarioId),
    enabled: authed,
  });
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => api.scenarios(),
    enabled: authed,
  });

  // Keep the selected node object in sync with the freshest tree data.
  useEffect(() => {
    if (!selected || !tree.data) return;
    const fresh = tree.data.nodes.find((n) => n.id === selected.id) ?? null;
    setSelected(fresh);
  }, [tree.data]);

  // Default selection to the root once the tree loads.
  useEffect(() => {
    if (!selected && tree.data && tree.data.nodes.length > 0) {
      const root = tree.data.nodes.find((n) => !n.parent) ?? tree.data.nodes[0];
      setSelected(root);
    }
  }, [tree.data]);

  function toggleTheme(): void {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    setTheme(next);
  }

  function go(t: Tab): void {
    setTab(t);
    if (t === 'structure') setFitToken((n) => n + 1);
  }

  if (me.isLoading) return <div className="loading">Checking session…</div>;
  if (!authed) {
    return <LoginGate onDone={() => qc.invalidateQueries({ queryKey: ['me'] })} />;
  }

  const [eyebrow, title, sub] = HEADERS[tab];
  const nodes = tree.data?.nodes ?? [];

  const mainTabs = TABS.filter((t) => t.group === 'main');
  const analyseTabs = TABS.filter((t) => t.group === 'analyse');

  return (
    <div id="app">
      <aside className="rail">
        <div className="brand">
          <div className="mark">WB</div>
          <div>
            <h1>Workforce Blueprint</h1>
            <p>Organisation design</p>
          </div>
        </div>
        <nav className="nav">
          {mainTabs.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'true' : 'false'} onClick={() => go(t.id)}>
              <Icon d={ICONS[t.id]} />
              {t.label}
            </button>
          ))}
          <div className="nav-label">Analyse</div>
          {analyseTabs.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'true' : 'false'} onClick={() => go(t.id)}>
              <Icon d={ICONS[t.id]} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ctx">
          <div className="ctx-card">
            <div className="row">
              <span className="lbl">Workspace</span>
              <span className="val">demo</span>
            </div>
            <div className="row">
              <span className="lbl">Role</span>
              <span className="val badge">{me.data?.role ?? '—'}</span>
            </div>
            <div className="row">
              <span className="lbl">As at</span>
              <span className="val">today</span>
            </div>
          </div>
          <div className="rail-actions">
            <button className="themebtn" onClick={toggleTheme}>
              {theme === 'light' ? '☾ Dark' : theme === 'dark' ? '☀ Light' : '◐ Theme'}
            </button>
            <button
              className="railbtn"
              onClick={async () => {
                await api.logout();
                qc.invalidateQueries({ queryKey: ['me'] });
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumb">
            Workforce Blueprint <span style={{ color: 'var(--faint)', margin: '0 6px' }}>/</span> <b>{title}</b>
          </div>
          <div className="spacer" />
          <div className="scenario-picker">
            <span className="tag-live">Reading</span>
            <select
              value={scenarioId}
              onChange={(e) => {
                setScenarioId(e.target.value);
                qc.invalidateQueries({ queryKey: ['tree', e.target.value] });
              }}
            >
              <option value={BASELINE}>Baseline</option>
              {(scenarios.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="head">
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>

        {tab === 'overview' && (
          <Overview scenarioId={scenarioId} scenarios={scenarios.data ?? []} onNavigate={go} />
        )}

        {tab === 'structure' && (
          <div className="view">
            {tree.isLoading && <div className="loading">Loading hierarchy…</div>}
            {tree.isError && (
              <div className="msg err">Could not load tree: {(tree.error as Error).message}</div>
            )}
            {tree.data && (
              <div className="chart-wrap">
                <div className="canvas-shell">
                  <div className="toolbar">
                    <div className="grp">
                      <button aria-pressed={colourMode === 'division'} onClick={() => setColourMode('division')}>
                        Division
                      </button>
                      <button aria-pressed={colourMode === 'span'} onClick={() => setColourMode('span')}>
                        Span
                      </button>
                    </div>
                    <button className="fitbtn" style={{ cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--radius-sm)', color: 'var(--muted)', font: '600 11.5px var(--sans)' }} onClick={() => setFitToken((n) => n + 1)}>
                      Fit to view
                    </button>
                    <span className="hint">
                      {tree.data.nodes.length} positions{tree.data.truncated ? ' (truncated)' : ''} · drag to pan · scroll to zoom
                    </span>
                  </div>
                  <OrgChart
                    nodes={nodes}
                    selectedId={selected?.id ?? null}
                    colourMode={colourMode}
                    fitToken={fitToken}
                    onSelect={setSelected}
                  />
                </div>
                <Inspector node={selected} nodes={nodes} scenarioId={scenarioId} colourMode={colourMode} />
              </div>
            )}
          </div>
        )}

        {tab === 'measures' && <MeasuresView scenarioId={scenarioId} />}

        {tab === 'scenario' && (
          <ScenarioView
            scenarioId={scenarioId}
            scenarios={scenarios.data ?? []}
            onSelectScenario={setScenarioId}
          />
        )}

        {tab === 'ingestion' && <IngestionView />}
      </main>
    </div>
  );
}
