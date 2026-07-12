import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { TreeNode } from '../api.ts';
import { Icon, DIVISION_COLOURS, type Toast } from '../ui.tsx';
import type { ColourMode } from './OrgChart.tsx';

interface Props {
  node: TreeNode | null;
  nodes: TreeNode[];
  scenarioId: string;
  colourMode: ColourMode;
  onNotify: (t: Omit<Toast, 'id'>) => void;
}

function Row({ k, v }: { k: string; v: string | number }): JSX.Element {
  return <div className="d-row"><span className="k">{k}</span><span className="v">{v}</span></div>;
}

export function Inspector({ node, nodes, scenarioId, colourMode, onNotify }: Props): JSX.Element {
  const qc = useQueryClient();
  const inScenario = scenarioId !== BASELINE;

  const cost = useQuery({ queryKey: ['cost', scenarioId, node?.id], queryFn: () => api.decompose(node!.id, scenarioId), enabled: !!node });

  const [newParent, setNewParent] = useState('');
  const reparent = useMutation({
    mutationFn: (parentId: string) => api.reparent(scenarioId, node!.id, parentId),
    onSuccess: () => {
      setNewParent('');
      qc.invalidateQueries({ queryKey: ['tree', scenarioId] });
      qc.invalidateQueries({ queryKey: ['measures', scenarioId] });
      qc.invalidateQueries({ queryKey: ['compare', scenarioId] });
      onNotify({ tone: 'good', title: 'Position moved', body: 'The scenario closure was rebuilt. The baseline is unchanged.' });
    },
  });

  const managers = useMemo(() => (node ? nodes.filter((n) => n.id !== node.id) : []), [nodes, node]);

  const legend = (
    <div className="chart-legend" aria-label="Chart colour legend">
      {colourMode === 'division' && Object.keys(DIVISION_COLOURS).filter((d) => d !== 'Executive' && d !== 'Unassigned').map((d) => (
        <span key={d}><i style={{ background: DIVISION_COLOURS[d] }} />{d}</span>
      ))}
      {colourMode === 'span' && (<><span><i style={{ background: '#aab6cf' }} />Low span</span><span><i style={{ background: '#2a78d6' }} />High span</span></>)}
      {colourMode === 'cost' && (<><span><i style={{ background: '#cfe0f5' }} />Lower cost</span><span><i style={{ background: '#1c4fd6' }} />Higher cost</span></>)}
      <span><i style={{ background: 'transparent', border: '1px dashed var(--warn)' }} />Vacant</span>
    </div>
  );

  if (!node) {
    return (
      <aside className="card card-pad inspector" aria-label="Position detail">
        <div className="empty-state" style={{ padding: '24px 8px' }}>
          <div className="es-ic"><Icon name="org" /></div>
          <h4>No position selected</h4>
          <p>Select a position in the chart to inspect its span, layer, descendants and loaded-cost build-up.</p>
        </div>
        {legend}
      </aside>
    );
  }

  const currency = cost.data?.currency ?? 'GBP';
  const costRow = (label: string, value: number | null): JSX.Element => (
    <Row k={label} v={value == null ? 'Restricted' : fmtMoney(value, currency)} />
  );

  return (
    <aside className="card card-pad inspector" aria-label={`Detail for ${node.title}`}>
      <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 650 }}>{node.title}</h3>
      <div className="s-sub" style={{ marginBottom: 10 }}>{(node.division ?? 'Unassigned')} · grade {node.grade ?? 'n/a'} · {node.id}</div>
      <span className={'tag ' + (node.vacant ? 'warn' : 'good')}>{node.vacant ? 'Vacant' : 'Filled'}</span>

      <div className="detail-list" style={{ marginTop: 12 }}>
        <Row k="Span of control" v={node.span} />
        <Row k="Layer index" v={node.layer} />
        <Row k="Total descendants" v={fmt(node.descendants)} />
        <Row k="Full-time equivalent" v={fmt(node.fte, 1)} />
      </div>

      <div className="section-h" style={{ margin: '16px 0 4px' }}><h3 style={{ fontSize: 14 }}>Cost build-up</h3><span className="s-sub">{currency}</span></div>
      {cost.isLoading && <div className="skeleton" style={{ height: 120 }} aria-label="Loading cost" />}
      {cost.isError && <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">Could not load cost.</div></div>}
      {cost.data && (cost.data.masked ? (
        <div className="alert info" role="note" style={{ marginTop: 8 }}>
          <Icon name="info" />
          <div className="a-body">Financial values are <b>restricted</b> at your permission level. The build-up is computed server-side and never exposed.</div>
        </div>
      ) : (
        <div className="detail-list">
          {costRow('Base', cost.data.base)}
          {costRow('On-costs', cost.data.onCosts)}
          {costRow('Benefits', cost.data.benefits)}
          {costRow('Bonus', cost.data.bonus)}
          {costRow('Overhead', cost.data.overhead)}
          <div className="d-row total"><span className="k" style={{ color: 'var(--text)', fontWeight: 600 }}>Loaded cost</span><span className="v">{cost.data.loaded == null ? 'Restricted' : fmtMoney(cost.data.loaded, currency)}</span></div>
        </div>
      ))}

      {inScenario && (
        <form className="form-field" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); if (newParent) reparent.mutate(newParent); }}>
          <label htmlFor="reparent-select">Move to report to <span className="opt">(scenario edit)</span></label>
          <select id="reparent-select" value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-describedby="reparent-hint">
            <option value="">Select a new manager…</option>
            {managers.map((mn) => <option key={mn.id} value={mn.id}>{mn.title} ({mn.id})</option>)}
          </select>
          <span className="hint" id="reparent-hint">The change is written to the scenario overlay only.</span>
          <button type="submit" className="btn btn-primary block" style={{ marginTop: 8 }} disabled={!newParent || reparent.isPending} aria-busy={reparent.isPending}>
            Move position
          </button>
          {reparent.isError && <div className="err-text"><Icon name="alert" />{(reparent.error as Error).message}</div>}
        </form>
      )}

      <div className="section-h" style={{ margin: '16px 0 4px' }}><h3 style={{ fontSize: 14 }}>Governance</h3></div>
      <div className="detail-list">
        <Row k="Record status" v="Active" />
        <Row k="Data source" v="Synthetic extract" />
        <Row k="Cost classification" v={cost.data?.masked ? 'Restricted' : 'Restricted (visible to owner)'} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>{legend}</div>
    </aside>
  );
}
