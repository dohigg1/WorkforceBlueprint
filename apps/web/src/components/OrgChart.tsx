import { useEffect, useRef, useCallback } from 'react';
import type { TreeNode } from '../api.ts';
import { DIVISION_COLOURS } from '../ui.tsx';

export type ColourMode = 'division' | 'span' | 'cost';

interface Props {
  nodes: TreeNode[];
  selectedId: string | null;
  colourMode: ColourMode;
  fitToken: number;
  onSelect: (node: TreeNode | null) => void;
}

// Card geometry and layout pitch, in world units.
const NW = 200;
const NH = 72;
const PITCH = 224;
const VGAP = 168;

const DIV_COLOURS = DIVISION_COLOURS;

function hexToRgb(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function initials(title: string): string {
  const w = title.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

interface Layout {
  vis: TreeNode[];
  px: Map<string, number>;
  py: Map<string, number>;
  kids: Map<string, TreeNode[]>;
}

// The main organisation chart, on a Canvas 2D context (never SVG) so it scales to
// a hundred thousand positions. Positions are laid out for the visible (expanded)
// subtree; the client owns pan, zoom, hit-testing, viewport culling,
// level-of-detail, collapse and paint, and draws each position as a card.
export function OrgChart({ nodes, selectedId, colourMode, fitToken, onSelect }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, s: 1 });
  const dpr = useRef(1);
  const costRange = useRef<[number, number]>([0, 1]);
  const raf = useRef(0);
  const collapsed = useRef<Set<string>>(new Set());
  const lay = useRef<Layout>({ vis: [], px: new Map(), py: new Map(), kids: new Map() });

  const state = useRef({ nodes, selectedId, colourMode, hoveredId: null as string | null });
  state.current = { ...state.current, nodes, selectedId, colourMode };

  const cssVar = useCallback((name: string, fallback: string): string => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }, []);

  const nodeColour = useCallback((n: TreeNode): string => {
    const mode = state.current.colourMode;
    if (mode === 'division') return (n.division && DIV_COLOURS[n.division]) || '#8a97ab';
    if (mode === 'cost') {
      const [lo, hi] = costRange.current;
      const t = hi > lo ? Math.min(1, Math.max(0, ((n.cost ?? 0) - lo) / (hi - lo))) : 0;
      return mix('#cfe0f5', '#1c4fd6', Math.sqrt(t));
    }
    return mix('#aab6cf', '#2a78d6', Math.min(1, n.span / 8));
  }, []);

  // Tidy layout of the visible subtree: leaves and collapsed nodes take one pitch
  // slot; a parent centres over its visible children. y follows the layer.
  const relayout = useCallback(() => {
    const ns = state.current.nodes;
    const byId = new Map(ns.map((n) => [n.id, n]));
    const kids = new Map<string, TreeNode[]>();
    for (const n of ns) {
      if (n.parent && byId.has(n.parent)) {
        const a = kids.get(n.parent) ?? (kids.set(n.parent, []).get(n.parent) as TreeNode[]);
        a.push(n);
      }
    }
    const px = new Map<string, number>();
    const py = new Map<string, number>();
    const vis: TreeNode[] = [];
    let cursor = 0;
    const walk = (n: TreeNode): void => {
      vis.push(n);
      py.set(n.id, n.layer * VGAP);
      const ch = kids.get(n.id) ?? [];
      if (ch.length === 0 || collapsed.current.has(n.id)) {
        px.set(n.id, cursor * PITCH);
        cursor += 1;
        return;
      }
      for (const k of ch) walk(k);
      px.set(n.id, (px.get(ch[0].id)! + px.get(ch[ch.length - 1].id)!) / 2);
    };
    for (const r of ns.filter((n) => !n.parent || !byId.has(n.parent))) walk(r);
    lay.current = { vis, px, py, kids };
  }, []);

  const roundRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const { selectedId: sel, hoveredId: hov } = state.current;
    const { vis, px, py, kids } = lay.current;
    const rect = canvas.getBoundingClientRect();
    const s = view.current.s;
    c.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);

    const line = cssVar('--line-strong', '#d7dde7');
    const text = cssVar('--text', '#0a2540');
    const muted = cssVar('--muted', '#556987');
    const faint = cssVar('--muted', '#697586');
    const panel = cssVar('--panel', '#ffffff');
    const inset = cssVar('--panel-inset', '#f2f5fa');
    const accent = cssVar('--accent', '#635bff');
    const warn = cssVar('--warn', '#ef8a10');
    const shadow = cssVar('--card-shadow', 'rgba(10,37,64,0.16)');

    const wx0 = -view.current.x / s - NW;
    const wy0 = -view.current.y / s - NH;
    const wx1 = (rect.width - view.current.x) / s + NW;
    const wy1 = (rect.height - view.current.y) / s + NH;

    c.save();
    c.translate(view.current.x, view.current.y);
    c.scale(s, s);

    // Connectors, behind cards, elbow-routed parent-bottom to child-top.
    const corner = Math.min(12, 20 / s);
    for (const n of vis) {
      const kk = kids.get(n.id) ?? [];
      if (kk.length === 0 || collapsed.current.has(n.id)) continue;
      const pxn = px.get(n.id)!;
      const pyn = py.get(n.id)!;
      const x1 = pxn + NW / 2;
      const y1 = pyn + NH;
      for (const k of kk) {
        const cxk = px.get(k.id)!;
        const cyk = py.get(k.id)!;
        if (Math.max(pyn, cyk) < wy0 - NH || Math.min(pyn, cyk) > wy1 + NH) continue;
        if (Math.max(pxn, cxk) < wx0 - NW || Math.min(pxn, cxk) > wx1 + NW) continue;
        const isHot = sel === k.id || sel === n.id || hov === k.id || hov === n.id;
        c.strokeStyle = isHot ? accent : line;
        c.lineWidth = (isHot ? 2 : 1.4) / s;
        const x2 = cxk + NW / 2;
        const y2 = cyk;
        const my = (y1 + y2) / 2;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x1, my - corner);
        c.arcTo(x1, my, x1 + Math.sign(x2 - x1) * corner, my, corner);
        c.lineTo(x2 - Math.sign(x2 - x1) * corner, my);
        c.arcTo(x2, my, x2, my + corner, corner);
        c.lineTo(x2, y2);
        c.stroke();
      }
    }

    const showFull = s >= 0.48;
    const showText = s >= 0.26;

    for (const n of vis) {
      const x = px.get(n.id)!;
      const y = py.get(n.id)!;
      if (x > wx1 || x + NW < wx0 || y > wy1 || y + NH < wy0) continue;
      const isSel = sel === n.id;
      const isHov = hov === n.id;
      const col = nodeColour(n);
      const ch = kids.get(n.id) ?? [];
      const isColl = collapsed.current.has(n.id);

      if (!showText) {
        roundRectPath(c, x, y, NW, NH, 10);
        c.fillStyle = col;
        c.globalAlpha = n.vacant ? 0.5 : 0.92;
        c.fill();
        c.globalAlpha = 1;
        if (isSel) {
          c.lineWidth = 3 / s;
          c.strokeStyle = accent;
          roundRectPath(c, x, y, NW, NH, 10);
          c.stroke();
        }
        continue;
      }

      if (showFull) {
        c.save();
        c.shadowColor = shadow;
        c.shadowBlur = 14 / s;
        c.shadowOffsetY = 3 / s;
        roundRectPath(c, x, y, NW, NH, 13);
        c.fillStyle = panel;
        c.fill();
        c.restore();
      } else {
        roundRectPath(c, x, y, NW, NH, 13);
        c.fillStyle = panel;
        c.fill();
      }

      c.save();
      roundRectPath(c, x, y, NW, NH, 13);
      c.clip();
      c.fillStyle = col;
      c.fillRect(x, y, 6, NH);
      c.restore();

      c.lineWidth = (isSel ? 2.4 : isHov ? 1.6 : 1) / s;
      c.strokeStyle = isSel ? accent : n.vacant ? warn : line;
      if (n.vacant) c.setLineDash([5 / s, 3 / s]);
      roundRectPath(c, x, y, NW, NH, 13);
      c.stroke();
      c.setLineDash([]);

      if (showFull) {
        const mcx = x + 34;
        const mcy = y + 27;
        c.beginPath();
        c.arc(mcx, mcy, 15, 0, Math.PI * 2);
        if (n.vacant) {
          c.setLineDash([3 / s, 2.5 / s]);
          c.lineWidth = 1.4 / s;
          c.strokeStyle = warn;
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = warn;
          c.font = '700 15px ui-sans-serif, system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('+', mcx, mcy + 0.5);
        } else {
          c.fillStyle = col;
          c.fill();
          c.fillStyle = '#ffffff';
          c.font = '700 12px ui-sans-serif, system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(initials(n.title), mcx, mcy + 0.5);
        }

        const tx = x + 58;
        c.textAlign = 'left';
        c.fillStyle = text;
        c.font = '650 14px ui-sans-serif, system-ui, sans-serif';
        c.textBaseline = 'alphabetic';
        clipText(c, n.title, tx, y + 25, NW - 58 - 14);
        c.fillStyle = muted;
        c.font = '500 11px ui-sans-serif, system-ui, sans-serif';
        clipText(c, `${n.division ?? 'Unassigned'} · ${n.grade ?? 'n/a'}`, tx, y + 41, NW - 58 - 14);

        const chips: [string, string][] = [['FTE', n.fte.toFixed(n.fte % 1 ? 1 : 0)], ['span', String(n.span)]];
        if (n.cost != null) chips.push(['cost', shortMoney(n.cost)]);
        let cx = x + 18;
        const cy = y + 52;
        c.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        for (const [k, v] of chips) {
          const label = `${k} ${v}`;
          const w = c.measureText(label).width + 14;
          if (cx + w > x + NW - 8) break;
          roundRectPath(c, cx, cy, w, 15, 7.5);
          c.fillStyle = inset;
          c.fill();
          c.fillStyle = faint;
          c.textBaseline = 'middle';
          c.fillText(label, cx + 7, cy + 8);
          c.textBaseline = 'alphabetic';
          cx += w + 6;
        }
      } else {
        c.fillStyle = text;
        c.font = '650 14px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        clipText(c, n.title, x + 18, y + NH / 2, NW - 30);
        c.textBaseline = 'alphabetic';
      }

      // Expand / collapse badge on the bottom edge for nodes with children.
      if (ch.length > 0) {
        const label = isColl ? '+' + n.descendants : String(ch.length);
        c.font = '700 11px ui-sans-serif, system-ui, sans-serif';
        const w = Math.max(24, c.measureText(label).width + 16);
        const bx = x + NW / 2 - w / 2;
        const by = y + NH - 9;
        roundRectPath(c, bx, by, w, 18, 9);
        c.fillStyle = isColl ? accent : panel;
        c.fill();
        c.lineWidth = 1.2 / s;
        c.strokeStyle = isColl ? accent : line;
        roundRectPath(c, bx, by, w, 18, 9);
        c.stroke();
        c.fillStyle = isColl ? '#ffffff' : muted;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(label, x + NW / 2, by + 9.5);
        c.textBaseline = 'alphabetic';
      }
    }
    c.restore();
  }, [cssVar, nodeColour]);

  const scheduleDraw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      draw();
    });
  }, [draw]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    dpr.current = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr.current);
    canvas.height = Math.round(r.height * dpr.current);
  }, []);

  const bounds = useCallback((): [number, number, number, number] => {
    const { vis, px, py } = lay.current;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const n of vis) {
      const x = px.get(n.id)!;
      const y = py.get(n.id)!;
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x + NW);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y + NH);
    }
    return [minx, miny, maxx, maxy];
  }, []);

  const focusTop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || lay.current.vis.length === 0) return;
    const ns = state.current.nodes;
    const root = ns.find((n) => !n.parent) ?? ns[0];
    const [minx, , maxx] = bounds();
    const r = canvas.getBoundingClientRect();
    const w = maxx - minx;
    // A fixed, readable scale so cards render in full; centre on the root, and
    // pan reveals the rest. If the visible tree already fits, centre the whole.
    const s = Math.max(0.48, Math.min(0.72, (r.width - 40) / w));
    const rootCx = (lay.current.px.get(root.id) ?? minx) + NW / 2;
    view.current.s = s;
    view.current.x = w * s <= r.width - 40 ? (r.width - w * s) / 2 - minx * s : r.width / 2 - rootCx * s;
    view.current.y = 44;
  }, [bounds]);

  const fitAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || lay.current.vis.length === 0) return;
    const [minx, miny, maxx, maxy] = bounds();
    const w = maxx - minx;
    const h = maxy - miny;
    const r = canvas.getBoundingClientRect();
    const pad = 56;
    let s = Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h);
    s = Math.max(0.04, Math.min(s, 1.1));
    view.current.s = s;
    view.current.x = (r.width - w * s) / 2 - minx * s;
    view.current.y = (r.height - h * s) / 2 - miny * s;
  }, [bounds]);

  const zoomBy = useCallback((f: number, sx?: number, sy?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const mx = sx ?? r.width / 2;
    const my = sy ?? r.height / 2;
    const wx = (mx - view.current.x) / view.current.s;
    const wy = (my - view.current.y) / view.current.s;
    view.current.s = Math.max(0.04, Math.min(3.5, view.current.s * f));
    view.current.x = mx - wx * view.current.s;
    view.current.y = my - wy * view.current.s;
    scheduleDraw();
  }, [scheduleDraw]);

  // On a new node set: default to showing the top three layers, then focus.
  useEffect(() => {
    const coll = new Set<string>();
    for (const n of nodes) if (n.layer >= 1) coll.add(n.id);
    collapsed.current = coll;
    let lo = Infinity, hi = -Infinity;
    for (const n of nodes) {
      if (n.cost == null) continue;
      lo = Math.min(lo, n.cost);
      hi = Math.max(hi, n.cost);
    }
    costRange.current = lo <= hi ? [lo, hi] : [0, 1];
    resize();
    relayout();
    focusTop();
    scheduleDraw();
  }, [nodes, resize, relayout, focusTop, scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [selectedId, colourMode, scheduleDraw]);

  useEffect(() => {
    resize();
    relayout();
    focusTop();
    scheduleDraw();
  }, [fitToken, resize, relayout, focusTop, scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;

    // Returns the node at a screen point, and whether the point is on its badge.
    const pick = (clientX: number, clientY: number): { node: TreeNode | null; badge: boolean } => {
      const r = canvas.getBoundingClientRect();
      const wx = (clientX - r.left - view.current.x) / view.current.s;
      const wy = (clientY - r.top - view.current.y) / view.current.s;
      const { vis, px, py, kids } = lay.current;
      for (let i = vis.length - 1; i >= 0; i--) {
        const n = vis[i];
        const x = px.get(n.id)!;
        const y = py.get(n.id)!;
        if (wx >= x && wx <= x + NW && wy >= y && wy <= y + NH) {
          const hasKids = (kids.get(n.id) ?? []).length > 0;
          const badge = hasKids && wy >= y + NH - 12 && Math.abs(wx - (x + NW / 2)) <= 26;
          return { node: n, badge };
        }
      }
      return { node: null, badge: false };
    };

    const onDown = (e: MouseEvent): void => {
      drag = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
      canvas.classList.add('grabbing');
    };
    const onMove = (e: MouseEvent): void => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        view.current.x = drag.vx + dx;
        view.current.y = drag.vy + dy;
        scheduleDraw();
        return;
      }
      const { node, badge } = pick(e.clientX, e.clientY);
      const id = node?.id ?? null;
      canvas.style.cursor = badge ? 'pointer' : id ? 'pointer' : 'grab';
      if (id !== state.current.hoveredId) {
        state.current.hoveredId = id;
        scheduleDraw();
      }
    };
    const onUp = (e: MouseEvent): void => {
      if (drag && !drag.moved) {
        const { node, badge } = pick(e.clientX, e.clientY);
        if (node && badge) {
          if (collapsed.current.has(node.id)) collapsed.current.delete(node.id);
          else collapsed.current.add(node.id);
          relayout();
          scheduleDraw();
        } else {
          onSelect(node);
        }
      }
      drag = null;
      canvas.classList.remove('grabbing');
    };
    const onLeave = (): void => {
      if (state.current.hoveredId) {
        state.current.hoveredId = null;
        scheduleDraw();
      }
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    };
    const onResize = (): void => {
      resize();
      scheduleDraw();
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [scheduleDraw, resize, relayout, onSelect, zoomBy]);

  function expandAll(): void {
    collapsed.current = new Set();
    relayout();
    fitAll();
    scheduleDraw();
  }

  return (
    <div className="canvas-host">
      <canvas ref={canvasRef} className="chart" />
      <div className="chart-controls">
        <button title="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        <button title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>&minus;</button>
        <button title="Expand all and fit" onClick={expandAll}>⤢</button>
        <button title="Back to top" onClick={() => { const c = new Set<string>(); for (const n of state.current.nodes) if (n.layer >= 1) c.add(n.id); collapsed.current = c; relayout(); focusTop(); scheduleDraw(); }}>⌂</button>
      </div>
    </div>
  );
}

function clipText(c: CanvasRenderingContext2D, t: string, x: number, y: number, maxw: number): void {
  if (c.measureText(t).width <= maxw) {
    c.fillText(t, x, y);
    return;
  }
  let s = t;
  while (s.length > 1 && c.measureText(s + '…').width > maxw) s = s.slice(0, -1);
  c.fillText(s + '…', x, y);
}

function shortMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '£' + Math.round(n / 1_000) + 'k';
  return '£' + Math.round(n);
}

export { DIV_COLOURS };
