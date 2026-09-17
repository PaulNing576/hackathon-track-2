// Formatting shared by client and server. Ranges everywhere, no fake precision.
import type { Range, Suit } from './types';

export function fmtUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export function fmtRange(r: Range | null): string {
  if (!r) return '—';
  return `${fmtUsdCompact(r.low)}–${fmtUsdCompact(r.high)}`;
}

export function fmtHours(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtMoneyExact(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// Casino-table palette: black suits (spades/clubs) render in warm ivory/gold
// against the dark felt; red suits (hearts/diamonds) in deep casino red —
// glyphs and labels (the actual suit-assignment logic) are unchanged.
export const SUIT_META: Record<Suit, { glyph: string; label: string; color: string; tint: string }> = {
  AVAILABILITY: { glyph: '♠', label: 'AVAILABILITY', color: '#d9c9a3', tint: 'rgba(217, 201, 163, 0.12)' },
  COST: { glyph: '♣', label: 'COST', color: '#c9a24d', tint: 'rgba(201, 162, 77, 0.12)' },
  PERFORMANCE: { glyph: '♦', label: 'PERFORMANCE', color: '#c1495a', tint: 'rgba(193, 73, 90, 0.14)' },
  CONFIG: { glyph: '♥', label: 'CONFIG', color: '#b3323f', tint: 'rgba(179, 50, 63, 0.14)' },
};

export const RISK_COLORS: Record<string, { color: string; tint: string }> = {
  LOW: { color: '#5fa37c', tint: 'rgba(95, 163, 124, 0.14)' },
  MEDIUM: { color: '#d1a13a', tint: 'rgba(209, 161, 58, 0.14)' },
  HIGH: { color: '#c9424f', tint: 'rgba(201, 66, 79, 0.18)' },
};

export const KIND_LABELS: Record<string, string> = {
  lost: 'destroyed work',
  consumed: 'low-value compute',
  degraded: 'slowed work',
  unused_capacity: 'never-used capacity',
  none: 'no GPU-hour claim',
};

export const STATE_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  underused: 'Underused',
  failing: 'Failure-heavy',
  mixed: 'Mixed',
};

export const WASTE_LABELS: Record<string, string> = {
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled (often deliberate)',
  TIMEOUT: 'Timed out',
  FAILED: 'Failed',
  NODE_FAIL: 'Node failure',
  UNDECODED_11: 'Other / undecoded',
  UNDECODED_1024: 'Other / undecoded',
};
