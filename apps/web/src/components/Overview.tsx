import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario, TreeNode } from '../api.ts';

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onNavigate: (tab: 'structure' | 'measures' | 'scenario' | 'ingestion') => void;
}

// Division palette, matching the org chart and inspector (CVD-validated order).
const DIV_COLOURS: Record<string, string> = {
  Executive: '#8a97ab',
  Technology: '#2a78d6',
  Commercial: '#eb6834',
  Operations: '#1baf7a',
  Finance: '#eda100',
  People: '#e34948',
  Product: '#4a3aa7',
  Unassigned: '#8a97ab',
};

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(2) + 'M';
  return '£' + Math.round(n).toLocaleString('en-GB');
}
// Compact money for tight legend cells.
function moneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '£' + Math.round(n / 1_000) + 'k';
  return '£' + Math.round(n);
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
  wallet: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M21 7H7a2 2 0 0 0 0 4h14v-4Zm-4 2h.01',
  spark: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
};

// A donut, an SVG mark that is not the main organisation chart. Segments are
// drawn as stroked arcs with a small gap between them; the centre carries the
// total. Colour follows the division entity, never its rank.
function Donut({ segments, total }: { segments: { label: string; value: number; colour: string }[]; total: string }): JSX.Element {
  const size = 140;
  const sw = 20;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  const gap = 2.2;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Cost by division">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-inset)" strokeWidth={sw} />
        {segments.map((s) => {
          const len = (s.value / sum) * c;
          const dash = Math.max(0, len - gap);
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.colour}
              strokeWidth={sw}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${money(s.value)}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="50%" y="47%" textAnchor="middle" style={{ font: '740 19px var(--sans)', fill: 'var(--text)', letterSpacing: '-0.03em' }}>{total}</text>
      <text x="50%" y="61%" textAnchor="middle" style={{ font: '600 10px var(--sans)', fill: 'var(--faint)', letterSpacing: '0.02em' }}>loaded cost</text>
    </svg>
  );
}

// A radial gauge for a target-band measure. The arc fills to value/max; its
// colour is the status against the band; the centre reads the value.
function Gauge({ label, value, display, max, band }: { label: string; value: number; display: string; max: number; band: [number, number] }): JSX.Element {
  const size = 116;
  const sw = 10;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  const [lo, hi] = band;
  const status = value < lo ? 'below' : value > hi ? 'above' : 'on';
  const colour = status === 'on' ? 'var(--good)' : status === 'below' ? 'var(--warn)' : 'var(--crit)';
  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-inset)" strokeWidth={sw} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={`${frac * c} ${c}`} />
        </g>
        <text x="50%" y="48%" textAnchor="middle" style={{ font: '740 24px var(--sans)', fill: 'var(--text)', letterSpacing: '-0.03em' }}>{display}</text>
        <text x="50%" y="63%" textAnchor="middle" style={{ font: '600 9.5px var(--sans)', fill: colour, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{status === 'on' ? 'on target' : status + ' target'}</text>
      </svg>
      <div className="g-label">{label}</div>
      <div className="g-band">target {lo} to {hi}</div>
    </div>
  );
}

function Delta({ value, money: isMoney, pct }: { value: number; money?: boolean; pct?: number }): JSX.Element {
  const flat = Math.abs(value) < (isMoney ? 0.5 : 0.005);
  const dir = flat ? 'flat' : value < 0 ? 'down' : 'up';
  const sign = value > 0 ? '+' : '';
  const txt = flat ? 'no change' : `${sign}${isMoney ? fmtMoney(value) : fmt(value)}${pct != null ? ` (${sign}${fmt(pct, 1)}%)` : ''}`;
  return (
    <span className={'delta-pill ' + dir}>
      {!flat && (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={value < 0 ? 'M7 7l10 10M17 17H9M17 17V9' : 'M7 17 17 7M7 7h8M15 7v8'} />
        </svg>
      )}
      {txt}
    </span>
  );
}

// The Overview: an executive reading of the one measure engine, arranged as a
// modern analytics dashboard. Current state, the cost and shape of the
// organisation as charts, and position-level detail. The division filter scopes
// the layering and detail below.
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

  // Cost by division for the donut (real per-node cost rolled up).
  const costByDiv = useMemo(() => {
    const by = new Map<string, number>();
    for (const n of allNodes) {
      const d = n.division ?? 'Unassigned';
      by.set(d, (by.get(d) ?? 0) + (n.cost ?? 0));
    }
    return [...by.entries()]
      .map(([label, value]) => ({ label, value, colour: DIV_COLOURS[label] ?? '#8a97ab' }))
      .sort((a, b) => b.value - a.value);
  }, [allNodes]);
  const costTotal = costByDiv.reduce((a, s) => a + s.value, 0);
  const hasCost = allNodes.some((n) => n.cost != null);

  const layerRows = useMemo(() => {
    const by = new Map<number, number>();
    for (const n of nodes) by.set(n.layer, (by.get(n.layer) ?? 0) + 1);
    const max = Math.max(...by.keys(), 0);
    const out: { layer: number; count: number }[] = [];
    for (let l = 0; l <= max; l++) out.push({ layer: l, count: by.get(l) ?? 0 });
    return out;
  }, [nodes]);
  const maxLayerCount = Math.max(1, ...layerRows.map((r) => r.count));

  const grid = useMemo(() => {
    const set = new Set(nodes.map((n) => n.id));
    const kids = new Map<string, TreeNode[]>();
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      if (n.parent && set.has(n.parent)) {
        const arr = kids.get(n.parent) ?? (kids.set(n.parent, []).get(n.parent) as TreeNode[]);
        arr.push(n);
      } else {
        roots.push(n);
      }
    }
    const fteSum = new Map<string, number>();
    const costSum = new Map<string, number>();
    const walk = (n: TreeNode): [number, number] => {
      let f = n.fte;
      let cc = n.cost ?? 0;
      for (const k of kids.get(n.id) ?? []) {
        const [cf, ck] = walk(k);
        f += cf;
        cc += ck;
      }
      fteSum.set(n.id, f);
      costSum.set(n.id, cc);
      return [f, cc];
    };
    for (const rt of roots) walk(rt);
    const rootFte = Math.max(1, ...roots.map((rt) => fteSum.get(rt.id) ?? 0));
    const rootCost = Math.max(1, ...roots.map((rt) => costSum.get(rt.id) ?? 0));
    return { kids, roots, fteSum, costSum, rootFte, rootCost };
  }, [nodes]);

  const defaultExpanded = useMemo(() => {
    const s = new Set<string>();
    for (const rt of grid.roots) {
      s.add(rt.id);
      for (const k of grid.kids.get(rt.id) ?? []) s.add(k.id);
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
        for (const cN of sorted) push(cN, depth + 1);
      }
    };
    const sortedRoots = [...grid.roots].sort((a, b) => (grid.costSum.get(b.id) ?? 0) - (grid.costSum.get(a.id) ?? 0));
    for (const rt of sortedRoots) push(rt, 0);
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
  const vacRate = m.headcount ? (m.vacancies / m.headcount) * 100 : 0;

  // Real scenario impact deltas for the KPI pills.
  const cmp = compare.data;
  const dHead = cmp ? (cmp.scenario.headcount ?? 0) - (cmp.baseline.headcount ?? 0) : null;
  const dCost = cmp ? (cmp.scenario.cost ?? 0) - (cmp.baseline.cost ?? 0) : null;
  const dCostPct = cmp && cmp.baseline.cost ? (dCost! / cmp.baseline.cost) * 100 : null;
  const dCph = cmp ? (cmp.scenario.cost_per_head ?? 0) - (cmp.baseline.cost_per_head ?? 0) : null;
  const scenarioName = scenarios.find((s) => s.id === activeScenarioId)?.name;

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
        {scenarioName && <span className="scen-flag">Scenario impact vs {scenarioName}</span>}
      </div>

      {/* KPI row */}
      <div className="kpi-strip">
        <div className="kpi-x">
          <div className="top"><div className="lbl">Total positions</div><div className="ic"><Ico d={I.people} /></div></div>
          <div className="num">{fmt(m.headcount)}</div>
          {dHead != null && <Delta value={dHead} />}
          <div className="foot">{fmt(m.filled_headcount)} filled · {fmt(m.vacancies)} vacant · {fmt(m.fte, 0)} FTE</div>
        </div>
        <div className="kpi-x">
          <div className="top"><div className="lbl">Total loaded cost</div><div className="ic"><Ico d={I.coins} /></div></div>
          <div className="num money">{fmtMoney(m.cost)}</div>
          {dCost != null && <Delta value={dCost} money pct={dCostPct ?? undefined} />}
          <div className="foot">annual, fully loaded</div>
        </div>
        <div className="kpi-x">
          <div className="top"><div className="lbl">Cost per head</div><div className="ic"><Ico d={I.wallet} /></div></div>
          <div className="num money">{fmtMoney(m.cost_per_head)}</div>
          {dCph != null && <Delta value={dCph} money />}
          <div className="foot">loaded ÷ headcount</div>
        </div>
        <div className="kpi-x">
          <div className="top"><div className="lbl">Vacancy rate</div><div className="ic"><Ico d={I.spark} /></div></div>
          <div className="num">{fmt(vacRate, 1)}%</div>
          <span className={'delta-pill ' + (vacRate <= 10 ? 'down' : 'up')}>{vacRate <= 10 ? 'within 0–10% target' : 'above 0–10% target'}</span>
          <div className="foot">{fmt(m.vacancies)} of {fmt(m.headcount)} positions open</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="bento">
        <div className="panel chart-card">
          <div className="p-head"><div className="p-title">Cost by division</div></div>
          <div className="p-sub" style={{ marginBottom: 8 }}>Where the {fmtMoney(costTotal)} loaded cost sits</div>
          {hasCost ? (
            <div className="donut-row">
              <Donut segments={costByDiv} total={money(costTotal)} />
              <div className="donut-legend">
                {costByDiv.map((s) => (
                  <div className="dl-row" key={s.label}>
                    <span className="dl-dot" style={{ background: s.colour }} />
                    <span className="dl-name">{s.label}</span>
                    <span className="dl-val">{moneyShort(s.value)}</span>
                    <span className="dl-pct">{fmt((s.value / costTotal) * 100, 0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="note">Per-position cost is not projected in this read.</div>
          )}
        </div>

        <div className="panel chart-card">
          <div className="p-head"><div className="p-title">Targets</div></div>
          <div className="p-sub" style={{ marginBottom: 12 }}>Structural health against reference bands</div>
          <div className="gauge-row">
            <Gauge label="Span of control" value={m.average_span} display={fmt(m.average_span, 1)} max={12} band={[5, 9]} />
            <Gauge label="Managers" value={m.management_ratio * 100} display={fmt(m.management_ratio * 100, 0) + '%'} max={40} band={[15, 25]} />
            <Gauge label="Vacancy rate" value={vacRate} display={fmt(vacRate, 1) + '%'} max={20} band={[0, 10]} />
          </div>
        </div>

        <div className="panel chart-card">
          <div className="p-head"><div className="p-title">Organisation layering</div></div>
          <div className="p-sub" style={{ marginBottom: 14 }}>Headcount by depth {division !== 'All' ? `· ${division}` : ''}</div>
          <div className="layerbars">
            {layerRows.map((r) => (
              <div className="lb-row" key={r.layer}>
                <div className="lb-d">L{r.layer + 1}</div>
                <div className="lb-track"><div className="lb-fill" style={{ width: `${Math.max(3, (r.count / maxLayerCount) * 100)}%` }} /></div>
                <div className="lb-v">{fmt(r.count)}</div>
              </div>
            ))}
          </div>
          <div className="pyr-foot"><span>{layerRows.length} layers</span><span>{fmt(nodes.length)} positions</span></div>
        </div>
      </div>

      {/* Detail grid */}
      <div className="zone-title" style={{ marginTop: 30 }}>
        Position-level detail
        <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('structure')}>Open org chart &rarr;</button>
      </div>
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="dgrid">
            <thead>
              <tr><th>Role</th><th>Sum FTE</th><th>Sum fully loaded cost</th><th className="r">Span</th></tr>
            </thead>
            <tbody>
              {visibleRows.map(({ node, depth, hasKids }) => {
                const fteV = grid.fteSum.get(node.id) ?? node.fte;
                const costV = grid.costSum.get(node.id) ?? 0;
                return (
                  <tr key={node.id}>
                    <td>
                      <div className="rolecell" style={{ paddingLeft: 14 + depth * 18 }}>
                        <span className={'chev' + (hasKids ? '' : ' leaf') + (effExpanded.has(node.id) ? ' open' : '')} onClick={() => hasKids && toggle(node.id)}>
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                        </span>
                        <span className="dot" style={{ background: DIV_COLOURS[node.division ?? 'Unassigned'] ?? '#8a97ab' }} />
                        <span className={'nm' + (node.vacant ? ' vac' : '')} title={node.title}>{node.title}</span>
                      </div>
                    </td>
                    <td><div className="databar"><div className="track"><div className="fill fte" style={{ width: `${(fteV / grid.rootFte) * 100}%` }} /></div><div className="v">{fmt(fteV, fteV < 100 ? 1 : 0)}</div></div></td>
                    <td><div className="databar"><div className="track">{hasCost && <div className="fill cost" style={{ width: `${(costV / grid.rootCost) * 100}%` }} />}</div><div className={'v' + (hasCost ? '' : ' muted')}>{hasCost ? money(costV) : '—'}</div></div></td>
                    <td><div className="spancell">{node.span > 0 ? fmt(node.span) : '—'}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
