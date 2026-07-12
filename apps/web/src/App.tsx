import { useEffect, useRef, useState } from 'react';
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
import { Icon, useToasts, ToastHost } from './ui.tsx';

type Tab = 'overview' | 'structure' | 'measures' | 'scenario' | 'ingestion';

const NAV: { id: Tab; label: string; icon: string; group: 'main' | 'analyse' }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'main' },
  { id: 'structure', label: 'Organisation chart', icon: 'org', group: 'main' },
  { id: 'measures', label: 'Measures', icon: 'bars', group: 'analyse' },
  { id: 'scenario', label: 'Scenarios', icon: 'branch', group: 'analyse' },
  { id: 'ingestion', label: 'Data ingestion', icon: 'upload', group: 'analyse' },
];

const PAGE: Record<Tab, { title: string; desc: string }> = {
  overview: { title: 'Overview', desc: 'Size, cost and shape of the organisation, read from the measure engine as at today.' },
  structure: { title: 'Organisation chart', desc: 'The hierarchy of positions. Select a position to inspect its measures and cost build-up.' },
  measures: { title: 'Measures', desc: 'The standard measure library evaluated over the organisation scope.' },
  scenario: { title: 'Scenarios', desc: 'Model a restructure as a copy-on-write overlay and compare it with the baseline.' },
  ingestion: { title: 'Data ingestion', desc: 'Map a workforce extract to the canonical model and assess its quality before loading.' },
};

function LoginGate({ onDone }: { onDone: () => void }): JSX.Element {
  const login = useMutation({ mutationFn: () => api.devLogin(), onSuccess: onDone });
  return (
    <div className="gate">
      <div className="card card-pad">
        <div className="mark" aria-hidden="true">WB</div>
        <h1>Workforce Blueprint</h1>
        <p>Sign in to the demonstration workspace to explore organisation design, workforce cost and scenario planning on a synthetic dataset.</p>
        <button className="btn btn-primary block" aria-busy={login.isPending} disabled={login.isPending} onClick={() => login.mutate()}>
          Enter demonstration workspace
        </button>
        {login.isError && (
          <div className="alert crit" role="alert" style={{ marginTop: 14 }}>
            <Icon name="alert" />
            <div className="a-body">Could not sign in. {(login.error as Error).message}</div>
          </div>
        )}
        <div className="trust">
          <span><Icon name="check" /> Row-level security</span>
          <span><Icon name="check" /> Effective dated</span>
          <span><Icon name="check" /> Synthetic data only</span>
        </div>
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const qc = useQueryClient();
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>('overview');
  const [scenarioId, setScenarioId] = useState<string>(BASELINE);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [colourMode, setColourMode] = useState<ColourMode>('division');
  const [fitToken, setFitToken] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const authed = me.data?.authenticated === true;

  const tree = useQuery({ queryKey: ['tree', scenarioId], queryFn: () => api.tree(scenarioId), enabled: authed && tab === 'structure' });
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.scenarios(), enabled: authed });

  useEffect(() => {
    if (!selected || !tree.data) return;
    setSelected(tree.data.nodes.find((n) => n.id === selected.id) ?? null);
  }, [tree.data]);
  useEffect(() => {
    if (!selected && tree.data && tree.data.nodes.length > 0) {
      setSelected(tree.data.nodes.find((n) => !n.parent) ?? tree.data.nodes[0]);
    }
  }, [tree.data]);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleTheme(): void {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  }
  function go(t: Tab): void {
    setTab(t);
    setNavOpen(false);
    if (t === 'structure') setFitToken((n) => n + 1);
  }

  if (me.isLoading) return <div className="page-loading" role="status">Checking session…</div>;
  if (!authed) return <LoginGate onDone={() => qc.invalidateQueries({ queryKey: ['me'] })} />;

  const page = PAGE[tab];
  const mainNav = NAV.filter((n) => n.group === 'main');
  const analyseNav = NAV.filter((n) => n.group === 'analyse');

  const NavItem = ({ n }: { n: (typeof NAV)[number] }): JSX.Element => (
    <button
      className="navitem"
      aria-current={tab === n.id ? 'page' : undefined}
      title={collapsed ? n.label : undefined}
      onClick={() => go(n.id)}
    >
      <Icon name={n.icon} />
      <span>{n.label}</span>
    </button>
  );

  function exportToast(): void {
    push({ tone: 'info', title: 'Export is read-only in this demonstration', body: 'Report export to PowerPoint, Excel and PDF runs in the full application.' });
  }

  return (
    <div id="app" className={(collapsed ? 'rail-collapsed ' : '') + (navOpen ? 'nav-open' : '')}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <aside className="rail" ref={railRef}>
        <div className="rail-head">
          <div className="brand">
            <div className="mark" aria-hidden="true">WB</div>
            <div>
              <h1>Workforce Blueprint</h1>
              <p>Organisation design</p>
            </div>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          {mainNav.map((n) => <NavItem key={n.id} n={n} />)}
          <div className="nav-label" id="nav-analyse">Analyse</div>
          {analyseNav.map((n) => <NavItem key={n.id} n={n} />)}
        </nav>
        <div className="rail-foot">
          <button className="userchip" onClick={() => push({ tone: 'info', title: 'Signed in as workspace owner', body: 'Account management runs in the full application.' })}>
            <span className="avatar" aria-hidden="true">DO</span>
            <span className="who">
              <span className="n">Demo workspace</span>
              <span className="r">{me.data?.role ?? 'owner'}</span>
            </span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="appbar">
          <button className="iconbtn hamburger" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <button className="iconbtn railtoggle" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => setCollapsed((c) => !c)}>
            <Icon name="sidebar" />
          </button>
          <span className="env" title="Environment and workspace">
            <span className="dot" aria-hidden="true" /> Demonstration · demo workspace
          </span>
          <div className="spacer" />
          <button className="iconbtn" aria-label="Help" onClick={() => push({ tone: 'info', title: 'About this workspace', body: 'Every figure is computed by the measure engine over a synthetic 219-position organisation.' })}>
            <Icon name="help" />
          </button>
          <button className="iconbtn" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={theme === 'dark'} onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </header>

        <div className="pageheader">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <a href="#main-content" onClick={(e) => { e.preventDefault(); go('overview'); }}>Workforce Blueprint</a>
            <span className="sep" aria-hidden="true">/</span>
            <span aria-current="page">{page.title}</span>
          </nav>
          <div className="ph-row">
            <div className="ph-titles">
              <h2>{page.title}</h2>
              <p>{page.desc}</p>
              <div className="ph-meta">
                <span className="m-item field-inline">
                  <label htmlFor="scenario-select">Reading</label>
                </span>
                <select
                  id="scenario-select"
                  className="control"
                  value={scenarioId}
                  onChange={(e) => setScenarioId(e.target.value)}
                  aria-label="Scenario being read"
                >
                  <option value={BASELINE}>Baseline</option>
                  {(scenarios.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span className="m-item"><Icon name="clock" /> Last updated <b>today</b></span>
                {scenarioId !== BASELINE && <span className="tag info plain">Scenario overlay</span>}
              </div>
            </div>
            <div className="ph-actions">
              {tab === 'scenario' ? (
                <button className="btn btn-primary" onClick={() => { const el = document.getElementById('scenario-name'); el?.focus(); }}>
                  <Icon name="plus" /> New scenario
                </button>
              ) : tab === 'ingestion' ? (
                <span className="results-count">Analysis is performed below</span>
              ) : (
                <button className="btn btn-secondary" onClick={exportToast}>
                  <Icon name="download" /> Export report
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="view" id="main-content" tabIndex={-1}>
          {tab === 'overview' && <Overview scenarioId={scenarioId} scenarios={scenarios.data ?? []} onNavigate={go} />}

          {tab === 'structure' && (
            <>
              {tree.isLoading && <TableSkeleton label="Loading organisation chart…" />}
              {tree.isError && (
                <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">Could not load the organisation chart. {(tree.error as Error).message}</div></div>
              )}
              {tree.data && (
                <div className="chart-layout">
                  <section className="card" aria-label="Organisation chart">
                    <div className="card-pad toolbar" style={{ borderBottom: '1px solid var(--line)' }}>
                      <div className="field-inline">
                        <span id="colour-label" className="s-sub" style={{ fontWeight: 600 }}>Colour by</span>
                      </div>
                      <div className="seg" role="group" aria-labelledby="colour-label">
                        {(['division', 'span', 'cost'] as ColourMode[]).map((m) => (
                          <button key={m} aria-pressed={colourMode === m} onClick={() => setColourMode(m)}>
                            {m === 'division' ? 'Division' : m === 'span' ? 'Span of control' : 'Loaded cost'}
                          </button>
                        ))}
                      </div>
                      <span className="results-count" style={{ marginLeft: 'auto' }}>
                        {tree.data.nodes.length} positions{tree.data.truncated ? ' (truncated)' : ''}
                      </span>
                    </div>
                    <OrgChart nodes={tree.data.nodes} selectedId={selected?.id ?? null} colourMode={colourMode} fitToken={fitToken} onSelect={setSelected} />
                  </section>
                  <Inspector node={selected} nodes={tree.data.nodes} scenarioId={scenarioId} colourMode={colourMode} onNotify={push} />
                </div>
              )}
            </>
          )}

          {tab === 'measures' && <MeasuresView scenarioId={scenarioId} />}
          {tab === 'scenario' && <ScenarioView scenarioId={scenarioId} scenarios={scenarios.data ?? []} onSelectScenario={setScenarioId} onNotify={push} />}
          {tab === 'ingestion' && <IngestionView />}
        </main>
      </div>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function TableSkeleton({ label }: { label: string }): JSX.Element {
  return (
    <div className="card" role="status" aria-label={label}>
      <div style={{ padding: 16 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton sk-row" style={{ marginBottom: 8, height: 40 }} />)}
      </div>
    </div>
  );
}
