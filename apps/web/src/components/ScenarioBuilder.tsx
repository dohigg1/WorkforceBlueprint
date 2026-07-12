import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario, TreeNode } from '../api.ts';
import { Icon, DIVISION_COLOURS, type Toast } from '../ui.tsx';

interface Props {
  scenarios: Scenario[];
  onNotify: (t: Omit<Toast, 'id'>) => void;
}

interface Override { fte?: number; vacant?: boolean; parent?: string; costMult?: number; }
interface NewPos { id: string; title: string; division: string; grade: string; fte: number; vacant: boolean; cost: number; parent: string; }

interface Metrics {
  headcount: number; filled: number; vacancies: number; fte: number; cost: number;
  costPerPos: number; layers: number; avgSpan: number; managementRatio: number;
}

// Recompute the headline measures over an edited node set. This mirrors the
// server measure engine for the demonstration; in the full application these
// edits are written through the copy-on-write scenario overlay and recomputed
// server-side (INV-5, INV-6).
function recompute(base: TreeNode[], removed: Set<string>, ov: Map<string, Override>, added: NewPos[]): Metrics {
  const parentOf = new Map<string, string | null>();
  const cost0 = new Map<string, number>();
  const fte0 = new Map<string, number>();
  const vac0 = new Map<string, boolean>();
  for (const n of base) { parentOf.set(n.id, n.parent); cost0.set(n.id, n.cost ?? 0); fte0.set(n.id, n.fte); vac0.set(n.id, n.vacant); }
  for (const a of added) { parentOf.set(a.id, a.parent || null); cost0.set(a.id, a.cost); fte0.set(a.id, a.fte); vac0.set(a.id, a.vacant); }
  for (const [id, o] of ov) if (o.parent !== undefined) parentOf.set(id, o.parent);

  const present = new Set<string>();
  for (const n of base) if (!removed.has(n.id)) present.add(n.id);
  for (const a of added) present.add(a.id);

  const fteOf = (id: string): number => ov.get(id)?.fte ?? fte0.get(id) ?? 1;
  const vacOf = (id: string): boolean => ov.get(id)?.vacant ?? vac0.get(id) ?? false;
  const costOf = (id: string): number => (cost0.get(id) ?? 0) * (ov.get(id)?.costMult ?? 1);
  const presentParent = (id: string): string | null => {
    let p = parentOf.get(id) ?? null;
    while (p != null && !present.has(p)) p = parentOf.get(p) ?? null;
    return p != null && present.has(p) ? p : null;
  };

  const children = new Map<string, number>();
  const depth = new Map<string, number>();
  const ids = [...present];
  for (const id of ids) { const p = presentParent(id); if (p) children.set(p, (children.get(p) ?? 0) + 1); }
  // Depth via memoised climb.
  const computeDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const p = presentParent(id);
    const d = p == null ? 0 : computeDepth(p) + 1;
    depth.set(id, d);
    return d;
  };
  let maxDepth = 0, headcount = 0, vacancies = 0, fteSum = 0, costSum = 0, managers = 0, spanSum = 0;
  for (const id of ids) {
    headcount++;
    if (vacOf(id)) vacancies++;
    fteSum += fteOf(id);
    costSum += costOf(id);
    const sp = children.get(id) ?? 0;
    if (sp > 0) { managers++; spanSum += sp; }
    maxDepth = Math.max(maxDepth, computeDepth(id));
  }
  return {
    headcount, filled: headcount - vacancies, vacancies, fte: fteSum, cost: costSum,
    costPerPos: headcount ? costSum / headcount : 0, layers: headcount ? maxDepth + 1 : 0,
    avgSpan: managers ? spanSum / managers : 0, managementRatio: headcount ? managers / headcount : 0,
  };
}

export function ScenarioBuilder({ onNotify }: Props): JSX.Element {
  const tree = useQuery({ queryKey: ['tree', BASELINE], queryFn: () => api.tree(BASELINE) });
  const base = useMemo(() => tree.data?.nodes ?? [], [tree.data]);

  const [name, setName] = useState('Untitled scenario');
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [ov, setOv] = useState<Map<string, Override>>(new Map());
  const [added, setAdded] = useState<NewPos[]>([]);
  const [scope, setScope] = useState('All');
  const [costPct, setCostPct] = useState(5);
  const [headPct, setHeadPct] = useState(10);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const divisions = useMemo(() => [...new Set(base.map((n) => n.division ?? 'Unassigned'))].sort(), [base]);

  const baseMetrics = useMemo(() => recompute(base, new Set(), new Map(), []), [base]);
  const metrics = useMemo(() => recompute(base, removed, ov, added), [base, removed, ov, added]);

  const editCount = removed.size + ov.size + added.length;
  const inScope = (n: TreeNode): boolean => scope === 'All' || (n.division ?? 'Unassigned') === scope;

  function setOverride(id: string, patch: Override): void {
    setOv((m) => { const next = new Map(m); next.set(id, { ...next.get(id), ...patch }); return next; });
  }
  function remove(id: string): void { setRemoved((s) => new Set(s).add(id)); }
  function restore(id: string): void { setRemoved((s) => { const n = new Set(s); n.delete(id); return n; }); }
  function resetModel(): void { setRemoved(new Set()); setOv(new Map()); setAdded([]); }

  // Levers.
  function leverRemoveVacant(): void {
    setRemoved((s) => { const n = new Set(s); for (const b of base) if (b.vacant && inScope(b)) n.add(b.id); return n; });
    onNotify({ tone: 'good', title: 'Lever applied', body: 'Vacant positions removed in scope.' });
  }
  function leverReduceHeadcount(): void {
    const candidates = base.filter((b) => inScope(b) && !removed.has(b.id) && b.parent).sort((a, b) => (a.vacant === b.vacant ? (a.cost ?? 0) - (b.cost ?? 0) : a.vacant ? -1 : 1));
    const target = Math.round(candidates.length * (headPct / 100));
    setRemoved((s) => { const n = new Set(s); for (let i = 0; i < target; i++) n.add(candidates[i].id); return n; });
    onNotify({ tone: 'good', title: 'Lever applied', body: `${target} positions removed (${headPct}% of scope), vacant and lowest-cost first.` });
  }
  function leverAdjustCost(sign: number): void {
    setOv((m) => {
      const next = new Map(m);
      for (const b of base) if (inScope(b) && !removed.has(b.id)) { const cur = next.get(b.id)?.costMult ?? 1; next.set(b.id, { ...next.get(b.id), costMult: cur * (1 + (sign * costPct) / 100) }); }
      return next;
    });
    onNotify({ tone: 'good', title: 'Lever applied', body: `Loaded cost ${sign > 0 ? 'increased' : 'reduced'} by ${costPct}% in scope.` });
  }
  function leverDelayer(): void {
    const childrenOf = new Map<string, TreeNode[]>();
    for (const b of base) if (b.parent && !removed.has(b.id)) (childrenOf.get(b.parent) ?? childrenOf.set(b.parent, []).get(b.parent)!).push(b);
    let count = 0;
    setOv((m) => {
      const nextOv = new Map(m);
      setRemoved((s) => {
        const nr = new Set(s);
        for (const b of base) {
          if (!inScope(b) || nr.has(b.id) || !b.parent) continue;
          const kids = (childrenOf.get(b.id) ?? []).filter((k) => !nr.has(k.id));
          if (kids.length === 1) { nextOv.set(kids[0].id, { ...nextOv.get(kids[0].id), parent: b.parent }); nr.add(b.id); count++; }
        }
        return nr;
      });
      return nextOv;
    });
    onNotify({ tone: 'good', title: 'Lever applied', body: `Delayered single-report managers in scope.` });
    void count;
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((n) => inScope(n) && (!q || n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))).slice(0, 200);
  }, [base, scope, query]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tree.isLoading) return <div className="skeleton" style={{ height: 400 }} aria-label="Loading positions" />;
  if (tree.isError) return <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">Could not load positions. {(tree.error as Error).message}</div></div>;

  const impact = [
    { k: 'Positions', v: fmt(metrics.headcount), d: metrics.headcount - baseMetrics.headcount, fav: undefined as boolean | undefined },
    { k: 'Full-time equivalent', v: fmt(metrics.fte, 1), d: metrics.fte - baseMetrics.fte, fav: undefined },
    { k: 'Vacancies', v: fmt(metrics.vacancies), d: metrics.vacancies - baseMetrics.vacancies, fav: true },
    { k: 'Loaded cost', v: fmtMoney(metrics.cost), d: metrics.cost - baseMetrics.cost, fav: true, money: true },
    { k: 'Cost per position', v: fmtMoney(metrics.costPerPos), d: metrics.costPerPos - baseMetrics.costPerPos, fav: true, money: true },
    { k: 'Average span', v: fmt(metrics.avgSpan, 2), d: metrics.avgSpan - baseMetrics.avgSpan, fav: undefined },
    { k: 'Layers', v: fmt(metrics.layers), d: metrics.layers - baseMetrics.layers, fav: true },
  ];

  return (
    <div>
      <div className="alert info" role="note" style={{ marginBottom: 16 }}>
        <Icon name="info" />
        <div className="a-body">Model a restructure by pulling levers or editing positions. The impact recomputes live. This demonstration models the change client-side; in the full application every edit is written through the copy-on-write scenario overlay and recomputed by the measure engine, leaving the baseline unchanged.</div>
      </div>

      <div className="form-field" style={{ maxWidth: 420 }}>
        <label htmlFor="scenario-name">Scenario name</label>
        <input id="scenario-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* Impact */}
      <div className="section-h"><h3 id="imp-h">Modelled impact <span className="s-sub">· {name} vs baseline</span></h3>
        <span className="results-count">{editCount} edit{editCount === 1 ? '' : 's'}{editCount > 0 ? '' : ' — baseline'}</span>
      </div>
      <div className="metric-grid" aria-labelledby="imp-h" aria-live="polite">
        {impact.map((it) => {
          const flat = Math.abs(it.d) < (it.money ? 0.5 : 0.005);
          const favourable = it.fav === undefined ? undefined : (it.d < 0) === it.fav;
          const tone = flat ? 'neutral' : favourable === undefined ? 'neutral' : favourable ? 'favourable' : 'adverse';
          return (
            <div className="metric" key={it.k}>
              <div className="m-label">{it.k}</div>
              <div className={'m-value' + (it.money ? ' money' : '')}>{it.v}</div>
              <div className="m-foot">
                {flat ? <span className="trend neutral">No change</span> : (
                  <span className={'trend ' + tone}><Icon name={it.d > 0 ? 'upRight' : 'downRight'} />{it.d > 0 ? '+' : ''}{it.money ? fmtMoney(it.d) : fmt(it.d, Number.isInteger(it.d) ? 0 : 2)}</span>
                )}
                <span>vs baseline</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Levers */}
      <div className="section-h" style={{ marginTop: 28 }}><h3>Levers</h3></div>
      <section className="card card-pad">
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <div className="filter-chip"><label htmlFor="lever-scope">Apply to</label>
            <select id="lever-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="All">All divisions</option>
              {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <span className="results-count">Levers act on the selected scope</span>
        </div>
        <div className="lever-grid">
          <div className="lever">
            <div className="lv-t">Remove vacant positions</div>
            <p>Delete every unfilled seat in scope.</p>
            <button className="btn btn-secondary sm" onClick={leverRemoveVacant}>Apply</button>
          </div>
          <div className="lever">
            <div className="lv-t">Reduce headcount</div>
            <p>Remove <b>{headPct}%</b> of positions, vacant and lowest-cost first.</p>
            <div className="lv-row">
              <input type="number" min={0} max={100} value={headPct} onChange={(e) => setHeadPct(Math.max(0, Math.min(100, Number(e.target.value))))} aria-label="Headcount reduction per cent" />
              <button className="btn btn-secondary sm" onClick={leverReduceHeadcount}>Apply</button>
            </div>
          </div>
          <div className="lever">
            <div className="lv-t">Adjust loaded cost</div>
            <p>Apply a uniform cost change of <b>{costPct}%</b> in scope.</p>
            <div className="lv-row">
              <input type="number" min={0} max={100} value={costPct} onChange={(e) => setCostPct(Math.max(0, Math.min(100, Number(e.target.value))))} aria-label="Cost adjustment per cent" />
              <button className="btn btn-secondary sm" onClick={() => leverAdjustCost(-1)}>Reduce</button>
              <button className="btn btn-secondary sm" onClick={() => leverAdjustCost(1)}>Increase</button>
            </div>
          </div>
          <div className="lever">
            <div className="lv-t">Delayer</div>
            <p>Remove single-report managers, lifting their report up one level.</p>
            <button className="btn btn-secondary sm" onClick={leverDelayer}>Apply</button>
          </div>
        </div>
      </section>

      {/* Manual editing */}
      <div className="section-h" style={{ marginTop: 28 }}>
        <div><h3 id="edit-h">Edit positions</h3><span className="s-sub">Change FTE, status or reporting line, or remove a position</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-tertiary sm" onClick={resetModel} disabled={editCount === 0}>Reset model</button>
          <button className="btn btn-secondary sm" onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd}><Icon name="plus" /> Add position</button>
        </div>
      </div>

      {showAdd && <AddPositionForm base={base} onAdd={(p) => { setAdded((a) => [...a, p]); setShowAdd(false); onNotify({ tone: 'good', title: 'Position added', body: `${p.title} added to the model.` }); }} onCancel={() => setShowAdd(false)} />}

      <div className="toolbar" style={{ margin: '12px 0' }}>
        <div className="filter-chip"><label htmlFor="edit-scope">Division</label>
          <select id="edit-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="All">All divisions</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="org-search"><Icon name="search" /><input aria-label="Search positions" placeholder="Search positions" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <span className="results-count" style={{ marginLeft: 'auto' }}>{rows.length} position{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data" aria-labelledby="edit-h">
            <thead><tr><th scope="col">Position</th><th scope="col" className="num">FTE</th><th scope="col">Status</th><th scope="col">Reports to</th><th scope="col" className="num">Loaded cost</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {added.map((a) => (
                <tr key={a.id} style={{ background: 'var(--accent-soft)' }}>
                  <td className="cell"><span className="tag info" style={{ marginRight: 6 }}>New</span>{a.title}</td>
                  <td className="cell num tnum">{fmt(a.fte, 1)}</td>
                  <td className="cell">{a.vacant ? <span className="tag warn">Vacant</span> : <span className="tag good">Filled</span>}</td>
                  <td className="cell">{base.find((b) => b.id === a.parent)?.title ?? '—'}</td>
                  <td className="cell num tnum">{fmtMoney(a.cost)}</td>
                  <td className="cell"><button className="link-btn" onClick={() => setAdded((arr) => arr.filter((x) => x.id !== a.id))}>Remove</button></td>
                </tr>
              ))}
              {rows.map((n) => {
                const isRemoved = removed.has(n.id);
                const o = ov.get(n.id);
                const fteV = o?.fte ?? n.fte;
                const vacV = o?.vacant ?? n.vacant;
                const costV = (n.cost ?? 0) * (o?.costMult ?? 1);
                return (
                  <tr key={n.id} style={isRemoved ? { opacity: 0.5 } : undefined}>
                    <td className="cell">
                      <span className="swatch" style={{ background: DIVISION_COLOURS[n.division ?? 'Unassigned'] ?? '#98a2b3', display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 8 }} aria-hidden="true" />
                      {n.title}{isRemoved && <span className="tag crit" style={{ marginLeft: 6 }}>Removed</span>}
                    </td>
                    <td className="cell num">
                      <input className="cell-input" type="number" min={0} max={1} step={0.1} value={fteV} disabled={isRemoved}
                        aria-label={`Full-time equivalent for ${n.title}`}
                        onChange={(e) => setOverride(n.id, { fte: Math.max(0, Math.min(1, Number(e.target.value))) })} />
                    </td>
                    <td className="cell">
                      <button className={'tag ' + (vacV ? 'warn' : 'good')} style={{ cursor: isRemoved ? 'default' : 'pointer', border: 0 }} disabled={isRemoved}
                        aria-pressed={vacV} onClick={() => setOverride(n.id, { vacant: !vacV })}>{vacV ? 'Vacant' : 'Filled'}</button>
                    </td>
                    <td className="cell">
                      <select className="cell-input" style={{ width: 150 }} value={o?.parent ?? n.parent ?? ''} disabled={isRemoved}
                        aria-label={`Manager for ${n.title}`} onChange={(e) => setOverride(n.id, { parent: e.target.value })}>
                        <option value="">(top of house)</option>
                        {base.filter((b) => b.id !== n.id).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                      </select>
                    </td>
                    <td className="cell num tnum">{fmtMoney(costV)}</td>
                    <td className="cell">
                      {isRemoved
                        ? <button className="link-btn" onClick={() => restore(n.id)}>Restore</button>
                        : <button className="link-btn" style={{ color: 'var(--crit)' }} onClick={() => remove(n.id)}>Remove</button>}
                    </td>
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

function AddPositionForm({ base, onAdd, onCancel }: { base: TreeNode[]; onAdd: (p: NewPos) => void; onCancel: () => void }): JSX.Element {
  const [title, setTitle] = useState('');
  const [division, setDivision] = useState('Operations');
  const [grade, setGrade] = useState('G4');
  const [fte, setFte] = useState(1);
  const [cost, setCost] = useState(80000);
  const [parent, setParent] = useState('');
  const [touched, setTouched] = useState(false);
  const err = touched && !title.trim() ? 'Enter a position title.' : '';
  const divisions = [...new Set(base.map((n) => n.division ?? 'Unassigned'))].sort();
  let seq = 0;
  return (
    <section className="card card-pad" aria-label="Add position">
      <div className="section-h"><h3 style={{ fontSize: 15 }}>Add a position</h3></div>
      <form onSubmit={(e) => { e.preventDefault(); setTouched(true); if (title.trim()) onAdd({ id: `NEW-${Date.now()}-${seq++}`, title: title.trim(), division, grade, fte, vacant: true, cost, parent }); }}>
        <div className="add-grid">
          <div className="form-field"><label htmlFor="np-title">Title <span className="req">*</span></label>
            <input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={err ? 'true' : undefined} aria-describedby={err ? 'np-title-err' : undefined} />
            {err && <span className="err-text" id="np-title-err"><Icon name="alert" />{err}</span>}
          </div>
          <div className="form-field"><label htmlFor="np-div">Division</label><select id="np-div" value={division} onChange={(e) => setDivision(e.target.value)}>{divisions.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div className="form-field"><label htmlFor="np-grade">Grade</label><input id="np-grade" value={grade} onChange={(e) => setGrade(e.target.value)} /></div>
          <div className="form-field"><label htmlFor="np-fte">FTE</label><input id="np-fte" type="number" min={0} max={1} step={0.1} value={fte} onChange={(e) => setFte(Number(e.target.value))} /></div>
          <div className="form-field"><label htmlFor="np-cost">Loaded cost (GBP)</label><input id="np-cost" type="number" min={0} step={1000} value={cost} onChange={(e) => setCost(Number(e.target.value))} /></div>
          <div className="form-field"><label htmlFor="np-parent">Reports to</label><select id="np-parent" value={parent} onChange={(e) => setParent(e.target.value)}><option value="">(top of house)</option>{base.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="submit" className="btn btn-primary sm">Add to model</button>
          <button type="button" className="btn btn-tertiary sm" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
