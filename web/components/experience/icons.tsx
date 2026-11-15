import type { SiteStatus } from '@/lib/engine/hud';

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg {...base} width="20" height="20" strokeWidth="2" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg {...base} width="18" height="18" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base} width="14" height="14" strokeWidth="3" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function PauseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

const STATUS_COLOR: Record<SiteStatus, string> = { viable: '#8FCB9B', marginal: '#E8C547', not_viable: '#E58A7B' };
const STATUS_NAME: Record<SiteStatus, string> = { viable: 'Viable', marginal: 'Marginal', not_viable: 'No viable' };

/** Shape plus colour, so the status never relies on colour alone. */
export function StatusIcon({ status, size = 16, labelled = true }: { status: SiteStatus; size?: number; labelled?: boolean }) {
  const a11y = labelled ? { role: 'img', 'aria-label': STATUS_NAME[status] } : { 'aria-hidden': true as const };
  return (
    <svg {...base} {...a11y} width={size} height={size} stroke={labelled ? STATUS_COLOR[status] : 'currentColor'} strokeWidth="2.4">
      {status === 'viable' && (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>)}
      {status === 'marginal' && (<><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><path d="M12 17.2v.3" /></>)}
      {status === 'not_viable' && (<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>)}
    </svg>
  );
}
