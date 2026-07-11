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

type Tab = 'structure' | 'measures' | 'scenario' | 'ingestion';

const TABS: { id: Tab; k: string; label: string }[] = [
  { id: 'structure', k: '01', label: 'Org chart' },
  { id: 'measures', k: '02', label: 'Measures' },
  { id: 'scenario', k: '03', label: 'Scenario' },
  { id: 'ingestion', k: '04', label: 'Ingestion' },
];

const HEADERS: Record<Tab, [string, string, string]> = {
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
          A validated, costed, navigable organisation from a messy spreadsheet. Enter the seeded
          demo workspace to explore the live engines.
        </p>
        <button className="btn" disabled={login.isPending} onClick={() => login.mutate()}>
          {login.isPending ? 'Entering…' : 'Enter demo workspace'}
        </button>
        {login.isError && (
          <div className="msg err" style={{ marginTop: 14 }}>
            {(login.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('structure');
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

  if (me.isLoading) return <div className="loading">Checking session…</div>;
  if (!authed) {
    return <LoginGate onDone={() => qc.invalidateQueries({ queryKey: ['me'] })} />;
  }

  const [eyebrow, title, sub] = HEADERS[tab];
  const nodes = tree.data?.nodes ?? [];

  return (
    <div id="app">
      <aside className="rail">
        <div className="brand">
          <div className="mark">WB</div>
          <div>
            <h1>Workforce Blueprint</h1>
            <p>organisation design</p>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? 'true' : 'false'}
              onClick={() => {
                setTab(t.id);
                if (t.id === 'structure') setFitToken((n) => n + 1);
              }}
            >
              <span className="k">{t.k}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ctx">
          <div className="row">
            <span className="lbl">Scenario</span>
          </div>
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
          <div className="row">
            <span className="lbl">Workspace</span>
            <span className="val">demo</span>
          </div>
          <div className="row">
            <span className="lbl">Role</span>
            <span className="val">{me.data?.role ?? '—'}</span>
          </div>
          <div className="row">
            <span className="lbl">As at</span>
            <span className="val">today</span>
          </div>
          <button className="themebtn" onClick={toggleTheme}>
            ◐ Toggle theme {theme ? `(${theme})` : ''}
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
      </aside>

      <main className="main">
        <div className="head">
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>

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
                      <button
                        aria-pressed={colourMode === 'division'}
                        onClick={() => setColourMode('division')}
                      >
                        Colour: division
                      </button>
                      <button aria-pressed={colourMode === 'span'} onClick={() => setColourMode('span')}>
                        Colour: span
                      </button>
                    </div>
                    <button className="grp" style={{ cursor: 'pointer' }} onClick={() => setFitToken((n) => n + 1)}>
                      Fit
                    </button>
                    <span className="hint">
                      {tree.data.nodes.length} positions{tree.data.truncated ? ' (truncated)' : ''} · drag to pan · scroll to zoom · click to select
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
