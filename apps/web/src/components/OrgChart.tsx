import { useEffect, useRef, useCallback } from 'react';
import type { TreeNode } from '../api.ts';

export type ColourMode = 'division' | 'span';

interface Props {
  nodes: TreeNode[];
  selectedId: string | null;
  colourMode: ColourMode;
  fitToken: number;
  onSelect: (node: TreeNode | null) => void;
}

const NW = 128;
const NH = 34;

const DIV_COLOURS: Record<string, string> = {
  Executive: '#8a97ab',
  Technology: '#635bff',
  Commercial: '#4f8bff',
  Operations: '#12a76a',
  Finance: '#ef8a10',
  People: '#e5484d',
  Product: '#a06bff',
};

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

// The main organisation chart is rendered on a Canvas 2D context, never in SVG,
// so that it scales to a hundred thousand positions. Server-side layout supplies
// x/y in world coordinates; this component owns pan, zoom, hit-testing and paint.
export function OrgChart({ nodes, selectedId, colourMode, fitToken, onSelect }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, s: 1 });
  const dpr = useRef(1);
  const byId = useRef(new Map<string, TreeNode>());

  // Latest props for the imperative draw loop without re-binding listeners.
  const state = useRef({ nodes, selectedId, colourMode });
  state.current = { nodes, selectedId, colourMode };

  const accentOf = useCallback((): string => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return v || '#37c9e2';
  }, []);

  const nodeColour = useCallback(
    (n: TreeNode): string => {
      if (state.current.colourMode === 'division') {
        return (n.division && DIV_COLOURS[n.division]) || '#8ea0c0';
      }
      const t = Math.min(1, n.span / 8);
      return mix('#aab6cf', accentOf(), t);
    },
    [accentOf],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const { nodes: ns, selectedId: sel } = state.current;
    const rect = canvas.getBoundingClientRect();
    c.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    c.save();
    c.translate(view.current.x, view.current.y);
    c.scale(view.current.s, view.current.s);

    const css = getComputedStyle(document.documentElement);
    const lineC = css.getPropertyValue('--line').trim() || '#22314e';
    const textC = css.getPropertyValue('--text').trim() || '#e7eef8';
    const panelC = css.getPropertyValue('--panel').trim() || '#131d33';
    const accentC = css.getPropertyValue('--accent').trim() || '#37c9e2';
    const warnC = css.getPropertyValue('--warn').trim() || '#e0a83a';

    const roundRect = (x: number, y: number, w: number, h: number, r: number): void => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };

    // Edges (parent to child), drawn as soft bezier connectors.
    c.strokeStyle = lineC;
    c.lineWidth = (1 / view.current.s) * 1.1;
    const map = byId.current;
    for (const n of ns) {
      if (!n.parent) continue;
      const p = map.get(n.parent);
      if (!p) continue;
      const x1 = p.x + NW / 2;
      const y1 = p.y + NH;
      const x2 = n.x + NW / 2;
      const y2 = n.y;
      const my = (y1 + y2) / 2;
      c.beginPath();
      c.moveTo(x1, y1);
      c.bezierCurveTo(x1, my, x2, my, x2, y2);
      c.stroke();
    }

    const showLabel = view.current.s > 0.34;
    for (const n of ns) {
      const isSel = sel === n.id;
      roundRect(n.x, n.y, NW, NH, 7);
      c.fillStyle = panelC;
      c.fill();
      // Accent stripe by colour mode.
      c.save();
      roundRect(n.x, n.y, 5, NH, 7);
      c.fillStyle = nodeColour(n);
      c.fill();
      c.restore();
      c.lineWidth = (isSel ? 2.4 : 1) / view.current.s;
      c.strokeStyle = isSel ? accentC : n.vacant ? warnC : lineC;
      if (n.vacant) c.setLineDash([4 / view.current.s, 3 / view.current.s]);
      else c.setLineDash([]);
      roundRect(n.x, n.y, NW, NH, 7);
      c.stroke();
      c.setLineDash([]);
      if (showLabel) {
        c.fillStyle = textC;
        c.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        c.textBaseline = 'middle';
        let t = n.title;
        const maxw = NW - 16;
        while (c.measureText(t).width > maxw && t.length > 4) t = t.slice(0, -2);
        if (t !== n.title) t = t.slice(0, -1) + '…';
        c.fillText(t, n.x + 11, n.y + NH / 2);
      }
    }
    c.restore();
  }, [nodeColour]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    dpr.current = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr.current);
    canvas.height = Math.round(r.height * dpr.current);
  }, []);

  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const ns = state.current.nodes;
    if (!canvas || ns.length === 0) return;
    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (const n of ns) {
      minx = Math.min(minx, n.x);
      maxx = Math.max(maxx, n.x + NW);
      miny = Math.min(miny, n.y);
      maxy = Math.max(maxy, n.y + NH);
    }
    const w = maxx - minx;
    const h = maxy - miny;
    const r = canvas.getBoundingClientRect();
    const pad = 40;
    let s = Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h);
    s = Math.max(0.12, Math.min(s, 1.4));
    view.current.s = s;
    view.current.x = (r.width - w * s) / 2 - minx * s;
    view.current.y = (r.height - h * s) / 2 - miny * s;
  }, []);

  // Rebuild id map and refit whenever the node set changes.
  useEffect(() => {
    byId.current = new Map(nodes.map((n) => [n.id, n]));
    resize();
    fitView();
    draw();
  }, [nodes, resize, fitView, draw]);

  // Redraw on selection or colour changes.
  useEffect(() => {
    draw();
  }, [selectedId, colourMode, draw]);

  // Fit on demand (Fit button / view entry).
  useEffect(() => {
    resize();
    fitView();
    draw();
  }, [fitToken, resize, fitView, draw]);

  // Pointer interaction: drag to pan, click to select, wheel to zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;

    const hitTest = (clientX: number, clientY: number): void => {
      const r = canvas.getBoundingClientRect();
      const mx = clientX - r.left;
      const my = clientY - r.top;
      const wx = (mx - view.current.x) / view.current.s;
      const wy = (my - view.current.y) / view.current.s;
      const ns = state.current.nodes;
      let found: TreeNode | null = null;
      for (let i = ns.length - 1; i >= 0; i--) {
        const n = ns[i];
        if (wx >= n.x && wx <= n.x + NW && wy >= n.y && wy <= n.y + NH) {
          found = n;
          break;
        }
      }
      onSelect(found);
    };

    const onDown = (e: MouseEvent): void => {
      drag = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
      canvas.classList.add('grabbing');
    };
    const onMove = (e: MouseEvent): void => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.current.x = drag.vx + dx;
      view.current.y = drag.vy + dy;
      draw();
    };
    const onUp = (e: MouseEvent): void => {
      if (drag && !drag.moved) hitTest(e.clientX, e.clientY);
      drag = null;
      canvas.classList.remove('grabbing');
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const wx = (mx - view.current.x) / view.current.s;
      const wy = (my - view.current.y) / view.current.s;
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      view.current.s = Math.max(0.1, Math.min(3.5, view.current.s * f));
      view.current.x = mx - wx * view.current.s;
      view.current.y = my - wy * view.current.s;
      draw();
    };
    const onResize = (): void => {
      resize();
      draw();
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [draw, resize, onSelect]);

  return <canvas ref={canvasRef} className="chart" />;
}

export { DIV_COLOURS };
