import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario, TreeNode } from '../api.ts';

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onNavigate: (tab: 'structure' | 'measures' | 'scenario' | 'ingestion') => void;
}

const DIV_COLOURS: Record<string, string> = {
  Executive: '#8a97ab',
  Technology: '#635bff',
  Commercial: '#4f8bff',
  Operations: '#12a76a',
  Finance: '#ef8a10',
  People: '#e5484d',
  Product: '#a06bff',
  Unassigned: '#8a97ab',
};

// Compact money for dense grid cells: millions above a million, else grouped.
function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(2) + 'M';
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function Ico({ d }: { d: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const I = {
  people: 'M17 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 2.13A4 4 0 0 1 16 10',
  coins: 'M12 8c3.87 0 7-1.34 7-3s-3.13-3-7-3-7 1.34-7 3 3.13 3 7 3Zm7 -3v14c0 1.66-3.13 3-7 3s-7-1.34-7-3V5M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3',
  tree: 'M12 3v4M6 21v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M3 21h6M15 21h6M9 5h6',
  manager: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8h4M21 6v4',
  vacancy: 'M12 5v14M5 12h14',
};

function CheckIco(): JSX.Element {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
function AlertIco(): JSX.Element {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
}

interface TargetKpi {
  label: string;
  icon: string;
  value: string;
  band?: [number, number];
  raw?: number;
  foot?: string;
  money?: boolean;
}

function TargetBadge({ band, raw }: { band: [number, number]; raw: number }): JSX.Element {
  const [lo, hi] = band;
  const status = raw < lo ? 'below' : raw > hi ? 'above' : 'on';
  const word = status === 'on' ? 'On target' : status === 'below' ? 'Below target' : 'Above target';
  return (
    <div className={'target-badge ' + status}>
      {status === 'on' ? <CheckIco /> : <AlertIco />}
      {word} ({lo} <span style={{ opacity: 0.6 }}>&rarr;</span> {hi})
    </div>
  );
}

// The Overview is a reading of the same measure engine that drives every other
// surface, arranged as an executive summary: current state, the layering of the
// organisation, and position-level detail, all at today's date. The division
// filter scopes the layering and the detail grid below it.
export function Overview({ scenarioId, scenarios, onNavigate }: Props): JSX.Element {
  const measures = useQuery({ queryKey: ['measures', scenarioId], queryFn: () => api.measures(scenarioId) });
  const tree = useQuery({ queryKey: ['tree', scenarioId], queryFn: () => api.tree(scenarioId) });

  const activeScenarioId = scenarioId !== BASELINE ? scenarioId : scenarios[0]?.id;
  const compare = useQuery({
    queryKey: ['compare', activeScenarioId],
    queryFn: () => api.compare(activeScenarioId!),
    enabled: !!activeScenarioId,
  });

  const [division, setDivision] = useState('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allNodes = tree.data?.nodes ?? [];
  const divisions = useMemo(() => {
    const s = new Set<string>();
    for (const n of allNodes) s.add(n.division ?? 'Unassigned');
    return [...s].sort();
  }, [allNodes]);

  const nodes = useMemo(
    () => (division === 'All' ? allNodes : allNodes.filter((n) => (n.division ?? 'Unassigned') === division)),
    [allNodes, division],
  );

  // Layering: headcount by depth over the filtered set.
  const layerRows = useMemo(() => {
    const by = new Map<number, number>();
    for (const n of nodes) by.set(n.layer, (by.get(n.layer) ?? 0) + 1);
    const max = Math.max(...by.keys(), 0);
    const out: { layer: number; count: number }[] = [];
    for (let l = 0; l <= max; l++) out.push({ layer: l, count: by.get(l) ?? 0 });
    return out;
  }, [nodes]);
  const maxLayerCount = Math.max(1, ...layerRows.map((r) => r.count));

  // Subtree rollups for the detail grid.
  const grid = useMemo(() => {
    const set = new Set(nodes.map((n) => n.id));
    const kids = new Map<string, TreeNode[]>();
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      if (n.parent && set.has(n.parent)) {
        (kids.get(n.parent) ?? kids.set(n.parent, []).get(n.parent)!).push(n);
      } else {
        roots.push(n);
      }
    }
    const fteSum = new Map<string, number>();
    const costSum = new Map<string, number>();
    const hasCost = nodes.some((n) => n.cost != null);
    const walk = (n: TreeNode): [number, number] => {
      let f = n.fte;
      let c = n.cost ?? 0;
      for (const k of kids.get(n.id) ?? []) {
        const [cf, cc] = walk(k);
        f += cf;
        c += cc;
      }
      fteSum.set(n.id, f);
      costSum.set(n.id, c);
      return [f, c];
    };
    for (const r of roots) walk(r);
    const rootFte = Math.max(1, ...roots.map((r) => fteSum.get(r.id) ?? 0));
    const rootCost = Math.max(1, ...roots.map((r) => costSum.get(r.id) ?? 0));
    return { kids, roots, fteSum, costSum, rootFte, rootCost, hasCost };
  }, [nodes]);

  // Default: expand the root and its first level once, whenever the set changes.
  const defaultExpanded = useMemo(() => {
    const s = new Set<string>();
    for (const r of grid.roots) {
      s.add(r.id);
      for (const k of grid.kids.get(r.id) ?? []) s.add(k.id);
    }
    return s;
  }, [grid]);
  const effExpanded = expanded.size === 0 ? defaultExpanded : expanded;

  const visibleRows = useMemo(() => {
    const rows: { node: TreeNode; depth: number; hasKids: boolean }[] = [];
    const push = (n: TreeNode, depth: number): void => {
      const children = grid.kids.get(n.id) ?? [];
      rows.push({ node: n, depth, hasKids: children.length > 0 });
      if (effExpanded.has(n.id)) {
        const sorted = [...children].sort((a, b) => (grid.costSum.get(b.id) ?? 0) - (grid.costSum.get(a.id) ?? 0));
        for (const c of sorted) push(c, depth + 1);
      }
    };
    const sortedRoots = [...grid.roots].sort((a, b) => (grid.costSum.get(b.id) ?? 0) - (grid.costSum.get(a.id) ?? 0));
    for (const r of sortedRoots) push(r, 0);
    return rows.slice(0, 400);
  }, [grid, effExpanded]);

  function toggle(id: string): void {
    const next = new Set(effExpanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  if (measures.isLoading) return <div className="loading">Evaluating the organisation…</div>;
  if (measures.isError) return <div className="view"><div className="msg err">Could not load measures: {(measures.error as Error).message}</div></div>;
  const m = measures.data!;

  const managers = Math.round((m.management_ratio ?? 0) * (m.headcount ?? 0));
  const vacRate = m.headcount ? (m.vacancies / m.headcount) * 100 : 0;

  const kpis: TargetKpi[] = [
    { label: 'Total positions', icon: I.people, value: fmt(m.headcount), foot: `${fmt(m.filled_headcount)} filled · ${fmt(m.vacancies)} vacant` },
    { label: 'Total loaded cost', icon: I.coins, value: fmtMoney(m.cost), money: true, foot: `${fmtMoney(m.cost_per_head)} per head` },
    { label: 'Average span of control', icon: I.tree, value: fmt(m.average_span, 1), band: [5, 9], raw: m.average_span },
    { label: 'Proportion managers', icon: I.manager, value: fmt(m.management_ratio * 100, 1) + '%', band: [15, 25], raw: m.management_ratio * 100, foot: `${fmt(managers)} managers · ${fmt(m.headcount)} positions` },
    { label: 'Open vacancies', icon: I.vacancy, value: fmt(vacRate, 1) + '%', band: [0, 10], raw: vacRate, foot: `${fmt(m.vacancies)} vacancies · ${fmt(m.headcount)} positions` },
  ];

  const scenarioName = scenarios.find((s) => s.id === activeScenarioId)?.name;
  const costDelta = compare.data ? (compare.data.scenario.cost ?? 0) - (compare.data.baseline.cost ?? 0) : null;
  const headDelta = compare.data ? (compare.data.scenario.headcount ?? 0) - (compare.data.baseline.headcount ?? 0) : null;

  return (
    <div className="view">
      <div className="filterbar">
        <span className="pages-lbl">Pages</span>
        <span className={'chip' + (division !== 'All' ? ' active' : '')}>
          <span className="chip-k">Division</span>
          <select value={division} onChange={(e) => { setDivision(e.target.value); setExpanded(new Set()); }}>
            <option value="All">All</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </span>
        <span className="chip"><span className="chip-k">Location</span><select disabled><option>All</option></select></span>
        <span className="chip"><span className="chip-k">Cost centre</span><select disabled><option>All</option></select></span>
      </div>

      <div className="zone-title"><span className="z">Zone 1</span> Current state</div>
      <div className="kpi-strip">
        {kpis.map((k) => (
          <div className="kpi-x" key={k.label}>
            <div className="top">
              <div className="lbl">{k.label}</div>
              <div className="ic"><Ico d={k.icon} /></div>
            </div>
            <div className={'num' + (k.money ? ' money' : '')}>{k.value}</div>
            {k.band && k.raw != null && <TargetBadge band={k.band} raw={k.raw} />}
            {k.foot && <div className="foot">{k.foot}</div>}
          </div>
        ))}
      </div>

      <div className="zone-2col">
        <div>
          <div className="zone-title"><span className="z">Zone 2</span> Overall layering</div>
          <div className="panel">
            <div className="p-sub" style={{ marginTop: 0 }}>
              Headcount by depth {division !== 'All' ? `· ${division}` : '· whole organisation'}
            </div>
            <div className="pyramid">
              {layerRows.map((r) => (
                <div className="pyr-row" key={r.layer}>
                  <div className="d">depth {r.layer + 1}</div>
                  <div className="pyr-track">
                    <div className="pyr-bar" style={{ width: `${Math.max(6, (r.count / maxLayerCount) * 100)}%` }}>
                      {r.count > 0 ? fmt(r.count) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pyr-foot">
              <span>{layerRows.length} layers deep</span>
              <span>{fmt(nodes.length)} positions</span>
            </div>
          </div>
        </div>

        <div>
          <div className="zone-title">
            <span className="z">Zone 3</span> Position-level detail
            <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('structure')}>
              Open org chart &rarr;
            </button>
          </div>
          <div className="grid-wrap">
            <div className="grid-scroll">
              <table className="dgrid">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Sum FTE</th>
                    <th>Sum fully loaded cost</th>
                    <th className="r">Span</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ node, depth, hasKids }) => {
                    const fteV = grid.fteSum.get(node.id) ?? node.fte;
                    const costV = grid.costSum.get(node.id) ?? 0;
                    return (
                      <tr key={node.id}>
                        <td>
                          <div className="rolecell" style={{ paddingLeft: 14 + depth * 18 }}>
                            <span
                              className={'chev' + (hasKids ? '' : ' leaf') + (effExpanded.has(node.id) ? ' open' : '')}
                              onClick={() => hasKids && toggle(node.id)}
                            >
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                            </span>
                            <span className="dot" style={{ background: DIV_COLOURS[node.division ?? 'Unassigned'] ?? '#8a97ab' }} />
                            <span className={'nm' + (node.vacant ? ' vac' : '')} title={node.title}>{node.title}</span>
                          </div>
                        </td>
                        <td>
                          <div className="databar">
                            <div className="track"><div className="fill fte" style={{ width: `${(fteV / grid.rootFte) * 100}%` }} /></div>
                            <div className="v">{fmt(fteV, fteV < 100 ? 1 : 0)}</div>
                          </div>
                        </td>
                        <td>
                          <div className="databar">
                            <div className="track">{grid.hasCost && <div className="fill cost" style={{ width: `${(costV / grid.rootCost) * 100}%` }} />}</div>
                            <div className={'v' + (grid.hasCost ? '' : ' muted')}>{grid.hasCost ? money(costV) : '—'}</div>
                          </div>
                        </td>
                        <td><div className="spancell">{node.span > 0 ? fmt(node.span) : '—'}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="zone-title" style={{ marginTop: 30 }}>
        <span className="z">Scenario</span> {scenarioName ? `Impact of “${scenarioName}”` : 'Scenario impact'}
        <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('scenario')}>Open scenarios &rarr;</button>
      </div>
      {compare.data ? (
        <div className="scen-strip">
          <div className="cell">
            <div className="k">Cost movement vs baseline</div>
            <div className="v" style={{ color: (costDelta ?? 0) <= 0 ? 'var(--good)' : 'var(--crit)' }}>
              {costDelta == null ? '—' : (costDelta > 0 ? '+' : '') + fmtMoney(costDelta)}
            </div>
          </div>
          <div className="cell">
            <div className="k">Headcount movement</div>
            <div className="v" style={{ color: (headDelta ?? 0) <= 0 ? 'var(--good)' : 'var(--crit)' }}>
              {headDelta == null ? '—' : (headDelta > 0 ? '+' : '') + fmt(headDelta)}
            </div>
          </div>
          <div className="cell">
            <div className="k">Scenario loaded cost</div>
            <div className="v">{fmtMoney(compare.data.scenario.cost ?? 0)}</div>
          </div>
          <div className="cell">
            <div className="k">Scenario layers</div>
            <div className="v">{fmt(compare.data.scenario.layers ?? 0)}</div>
          </div>
        </div>
      ) : (
        <div className="note">Create a scenario to model a restructure as a copy-on-write overlay, resolved at read time. The baseline is never touched.</div>
      )}
    </div>
  );
}
