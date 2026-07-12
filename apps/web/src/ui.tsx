import { useCallback, useEffect, useRef, useState } from 'react';

// A single coherent line-icon set (24px grid, 1.75 stroke). Icons are decorative
// by default; interactive controls that use them provide their own accessible
// name via aria-label.
const PATHS: Record<string, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z',
  org: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v4M6 17v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3',
  bars: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  branch: 'M6 3v12M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 3a2 2 0 1 0 0-.001M18 9a2 2 0 1 0 0-.001M18 9v2a4 4 0 0 1-4 4H6',
  upload: 'M12 15V3m0 0 4 4m-4-4L8 7M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sidebar: 'M4 4h16v16H4zM10 4v16',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check: 'M20 6 9 17l-5-5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8h.01M11 12h1v4h1',
  x: 'M18 6 6 18M6 6l12 12',
  chevronRight: 'M9 6l6 6-6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  upRight: 'M7 17 17 7M7 7h10v10',
  downRight: 'M7 7l10 10M17 17H7V7',
  people: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M17 3.13A4 4 0 0 1 17 11',
  coins: 'M8 8a6 3 0 1 0 12 0 6 3 0 1 0-12 0M20 8v6c0 1.66-2.7 3-6 3M8 8v10c0 1.66 2.7 3 6 3M4 6a4 2 0 1 0 8 0 4 2 0 1 0-8 0M4 6v10c0 1.1 1.8 2 4 2',
  wallet: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M21 7H7a2 2 0 0 0 0 4h14zM17 11h.01',
  gauge: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3a9 9 0 0 0-9 9M21 12a9 9 0 0 0-3-6.7',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
};

export function Icon({ name }: { name: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

// One division -> colour map, shared by the org chart, the cost chart, the
// legend and table swatches. Deliberately drawn from a cool/violet/magenta/slate
// categorical range that excludes the semantic red, amber and green, so a
// division colour is never confused with a status. Colour is always paired with
// a text label, so it is never the sole distinction.
export const DIVISION_COLOURS: Record<string, string> = {
  Executive: '#667085',
  Technology: '#1570ef',
  Operations: '#06aed4',
  Commercial: '#6938ef',
  Finance: '#dd2590',
  People: '#9e77ed',
  Product: '#0e7090',
  Unassigned: '#98a2b3',
};

export interface Toast {
  id: number;
  tone: 'info' | 'good';
  title: string;
  body?: string;
}

let toastSeq = 0;

export function useToasts(): { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastSeq;
    setToasts((ts) => [...ts, { ...t, id }]);
    window.setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);
  return { toasts, push, dismiss };
}

// A long date for audit-grade reporting, e.g. "12 July 2026". Computed in the
// browser at view time; this is the effective (as-at) date of the read.
export function effectiveDate(): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return 'today';
  }
}

export interface MenuAction { label: string; onSelect: () => void; icon?: string; }

// A small keyboard-accessible overflow menu. Opens on click, closes on Escape,
// outside click or selection; focus returns to the trigger.
export function OverflowMenu({ label, actions }: { label: string; actions: MenuAction[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu-anchor">
      <button ref={btnRef} className="iconbtn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open && (
        <div ref={menuRef} className="menu" role="menu" aria-label={label}>
          {actions.map((a) => (
            <button key={a.label} role="menuitem" className="menu-item" onClick={() => { setOpen(false); a.onSelect(); btnRef.current?.focus(); }}>
              {a.icon && <Icon name={a.icon} />}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): JSX.Element {
  return (
    <div className="toast-wrap" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.tone} role="status">
          <Icon name={t.tone === 'good' ? 'check' : 'info'} />
          <div>
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            {t.body && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{t.body}</div>}
          </div>
          <button className="t-close" aria-label="Dismiss notification" onClick={() => onDismiss(t.id)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
