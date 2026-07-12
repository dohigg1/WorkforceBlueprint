import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BASELINE } from './api.ts';
import type { TreeNode } from './api.ts';
import { OrgChart } from './components/OrgChart.tsx';
import type { ColourMode } from './components/OrgChart.tsx';
import { Inspector } from './components/Inspector.tsx';
import { MeasuresView } from './components/MeasuresView.tsx';
import { ScenarioBuilder } from './components/ScenarioBuilder.tsx';
import { IngestionView } from './components/IngestionView.tsx';
import { Overview } from './components/Overview.tsx';
import { Icon, useToasts, ToastHost, OverflowMenu, effectiveDate } from './ui.tsx';

type Tab = 'overview' | 'structure' | 'measures' | 'scenario' | 'ingestion';

const NAV: { id: Tab; label: string; icon: string; group: 'main' | 'analyse' }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'main' },
  { id: 'structure', label: 'Organisation chart', icon: 'org', group: 'main' },
  { id: 'measures', label: 'Measures', icon: 'bars', group: 'analyse' },
  { id: 'scenario', label: 'Scenarios', icon: 'branch', group: 'analyse' },
  { id: 'ingestion', label: 'Data ingestion', icon: 'upload', group: 'analyse' },
];

const PAGE: Record<Tab, { title: string; desc: string }> = {
  overview: { title: 'Overview', desc: 'Current organisational size, annualised cost and structure, from the latest measure-engine read.' },
  structure: { title: 'Organisation chart', desc: 'The hierarchy of positions. Select a position to inspect its measures and cost build-up.' },
  measures: { title: 'Measures', desc: 'The standard measure library evaluated over the organisation scope.' },
  scenario: { title: 'Scenario builder', desc: 'Model a restructure by pulling levers or editing positions; the impact recomputes against the baseline as you work.' },
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
  const [orgQuery, setOrgQuery] = useState('');
  const [centerToken, setCenterToken] = useState(0);
  const [expandToken, setExpandToken] = useState(0);
  const [collapseToken, setCollapseToken] = useState(0);
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

  function searchOrg(): void {
    const q = orgQuery.trim().toLowerCase();
    if (!q || !tree.data) return;
    const hit = tree.data.nodes.find((n) => n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    if (hit) { setSelected(hit); setCenterToken((t) => t + 1); }
    else push({ tone: 'info', title: 'No matching position', body: `Nothing matches “${orgQuery}”.` });
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
          <span className="env" title="Demonstration environment">
            <span className="dot" aria-hidden="true" /> Demo workspace
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
                <label htmlFor="scenario-select">Scenario</label>
                <select
                  id="scenario-select"
                  className="control"
                  value={scenarioId}
                  onChange={(e) => setScenarioId(e.target.value)}
                >
                  <option value={BASELINE}>Baseline</option>
                  {(scenarios.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span className="m-item"><Icon name="clock" /> Effective date <b>{effectiveDate()}</b></span>
                <span className="m-item">Source <b>Measure engine</b></span>
                {scenarioId !== BASELINE && <span className="tag info plain">Scenario overlay</span>}
              </div>
            </div>
            <div className="ph-actions">
              {tab === 'scenario' ? (
                <button className="btn btn-primary" onClick={() => document.getElementById('scenario-name')?.focus()}>
                  <Icon name="plus" /> New scenario
                </button>
              ) : tab !== 'ingestion' ? (
                <button className="btn btn-secondary desktop-only" onClick={exportToast}>
                  <Icon name="download" /> Export report
                </button>
              ) : null}
              <span className="ph-overflow">
                <OverflowMenu label="More actions" actions={[
                  { label: 'Export report', icon: 'download', onSelect: exportToast },
                  { label: 'Metric definitions', icon: 'info', onSelect: () => go('measures') },
                ]} />
              </span>
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
                      <span id="colour-label" className="s-sub" style={{ fontWeight: 600 }}>Colour by</span>
                      <div className="seg" role="group" aria-labelledby="colour-label">
                        {(['division', 'span', 'cost'] as ColourMode[]).map((m) => (
                          <button key={m} aria-pressed={colourMode === m} onClick={() => setColourMode(m)}>
                            {m === 'division' ? 'Division' : m === 'span' ? 'Span of control' : 'Loaded cost'}
                          </button>
                        ))}
                      </div>
                      <form className="org-search" role="search" onSubmit={(e) => { e.preventDefault(); searchOrg(); }}>
                        <Icon name="search" />
                        <input aria-label="Search positions by role or identifier" placeholder="Search positions" value={orgQuery} onChange={(e) => setOrgQuery(e.target.value)} />
                      </form>
                      <button className="btn btn-secondary sm" onClick={() => setExpandToken((t) => t + 1)}>Expand all</button>
                      <button className="btn btn-secondary sm" onClick={() => setCollapseToken((t) => t + 1)}>Collapse</button>
                      <span className="results-count" style={{ marginLeft: 'auto' }}>
                        {tree.data.nodes.length} positions{tree.data.truncated ? ' (truncated)' : ''}
                      </span>
                    </div>
                    <OrgChart
                      nodes={tree.data.nodes} selectedId={selected?.id ?? null} colourMode={colourMode}
                      fitToken={fitToken} onSelect={setSelected}
                      centerToken={centerToken} expandAllToken={expandToken} collapseTopToken={collapseToken}
                    />
                    <p className="card-pad" style={{ margin: 0, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--text-2)' }}>
                      Numbered badges show hidden reports; select a badge to expand a branch. For a keyboard-accessible list of positions, see the{' '}
                      <button className="link-btn" onClick={() => go('overview')} style={{ padding: 0 }}>position-level table on Overview</button>.
                    </p>
                  </section>
                  <Inspector node={selected} nodes={tree.data.nodes} scenarioId={scenarioId} colourMode={colourMode} onNotify={push} />
                </div>
              )}
            </>
          )}

          {tab === 'measures' && <MeasuresView scenarioId={scenarioId} />}
          {tab === 'scenario' && <ScenarioBuilder scenarios={scenarios.data ?? []} onNotify={push} />}
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
