import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { TreeNode } from '../api.ts';
import { DIV_COLOURS } from './OrgChart.tsx';

interface Props {
  node: TreeNode | null;
  nodes: TreeNode[];
  scenarioId: string;
  colourMode: 'division' | 'span';
}

function Stat({ k, v }: { k: string; v: string | number }): JSX.Element {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

// Right-hand inspector: shows the measures the engine computed for the selected
// position, the loaded-cost build-up (respecting masking), and, inside a
// scenario, a control to reparent the position through the scenario engine.
export function Inspector({ node, nodes, scenarioId, colourMode }: Props): JSX.Element {
  const qc = useQueryClient();
  const inScenario = scenarioId !== BASELINE;

  const cost = useQuery({
    queryKey: ['cost', scenarioId, node?.id],
    queryFn: () => api.decompose(node!.id, scenarioId),
    enabled: !!node,
  });

  const [newParent, setNewParent] = useState('');
  const reparent = useMutation({
    mutationFn: (parentId: string) => api.reparent(scenarioId, node!.id, parentId),
    onSuccess: () => {
      setNewParent('');
      qc.invalidateQueries({ queryKey: ['tree', scenarioId] });
      qc.invalidateQueries({ queryKey: ['measures', scenarioId] });
      qc.invalidateQueries({ queryKey: ['compare', scenarioId] });
    },
  });

  // Candidate managers: any position that is not the node itself.
  const managers = useMemo(
    () => (node ? nodes.filter((n) => n.id !== node.id) : []),
    [nodes, node],
  );

  if (!node) {
    return (
      <div className="inspector">
        <div className="empty">
          Select a position in the chart to inspect the measures the engine computes for it: span
          of control, layer index, and total descendants, plus its loaded-cost build-up.
        </div>
      </div>
    );
  }

  const currency = cost.data?.currency ?? 'GBP';
  const costRow = (label: string, value: number | null): JSX.Element => (
    <Stat k={label} v={value == null ? 'restricted' : fmtMoney(value, currency)} />
  );

  return (
    <div className="inspector">
      <h3>{node.title}</h3>
      <div className="role">
        {(node.division ?? 'Unassigned') + ' · grade ' + (node.grade ?? 'n/a') + ' · ' + node.id}
      </div>
      <div style={{ marginTop: 12 }}>
        {node.vacant ? (
          <span className="pill vac">Vacant</span>
        ) : (
          <span className="pill fil">Filled</span>
        )}
      </div>

      <Stat k="Span of control" v={node.span} />
      <Stat k="Layer index" v={node.layer} />
      <Stat k="Total descendants" v={node.descendants} />
      <Stat k="Full-time equivalent" v={fmt(node.fte, 1)} />

      <div className="section-title" style={{ margin: '16px 0 0' }}>
        Cost build-up
      </div>
      {cost.isLoading && <div className="empty">Loading cost…</div>}
      {cost.isError && <div className="msg err">Could not load cost.</div>}
      {cost.data &&
        (cost.data.masked ? (
          <>
            <div style={{ marginTop: 10 }}>
              <span className="pill mask">Restricted</span>
            </div>
            <div className="empty" style={{ marginTop: 8 }}>
              Financial values are masked for this role at your permission level. The build-up is
              computed server side over real values and never exposed.
            </div>
          </>
        ) : (
          <>
            {costRow('Base', cost.data.base)}
            {costRow('On-costs', cost.data.onCosts)}
            {costRow('Benefits', cost.data.benefits)}
            {costRow('Bonus', cost.data.bonus)}
            {costRow('Overhead', cost.data.overhead)}
            <div className="stat" style={{ borderTop: '1px solid var(--accent)' }}>
              <span className="k" style={{ color: 'var(--text)', fontWeight: 600 }}>
                Loaded
              </span>
              <span className="v" style={{ color: 'var(--accent)' }}>
                {cost.data.loaded == null ? 'restricted' : fmtMoney(cost.data.loaded, currency)}
              </span>
            </div>
          </>
        ))}

      {inScenario && (
        <div className="edit-box">
          <label htmlFor="reparent">Reparent (E07-02)</label>
          <select
            id="reparent"
            value={newParent}
            onChange={(e) => setNewParent(e.target.value)}
          >
            <option value="">Choose a new manager…</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.id})
              </option>
            ))}
          </select>
          <button
            className="btn wide"
            disabled={!newParent || reparent.isPending}
            onClick={() => reparent.mutate(newParent)}
          >
            {reparent.isPending ? 'Applying…' : 'Move position'}
          </button>
          {reparent.isError && (
            <div className="msg err">{(reparent.error as Error).message}</div>
          )}
          {reparent.isSuccess && <div className="msg ok">Moved. Closure rebuilt.</div>}
        </div>
      )}

      <div className="legend">
        {colourMode === 'division' ? (
          Object.keys(DIV_COLOURS)
            .filter((d) => d !== 'Executive')
            .map((d) => (
              <span key={d}>
                <i style={{ background: DIV_COLOURS[d] }} />
                {d}
              </span>
            ))
        ) : (
          <>
            <span>
              <i style={{ background: '#aab6cf' }} />
              low span
            </span>
            <span>
              <i style={{ background: 'var(--accent)' }} />
              high span
            </span>
          </>
        )}
        <span>
          <i style={{ background: 'transparent', border: '1px dashed var(--warn)' }} />
          vacant
        </span>
      </div>
    </div>
  );
}
