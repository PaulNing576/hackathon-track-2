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

export const SUIT_META: Record<Suit, { glyph: string; label: string; color: string; tint: string }> = {
  AVAILABILITY: { glyph: '♠', label: 'AVAILABILITY', color: '#1f3a5f', tint: '#eef1f6' },
  COST: { glyph: '♣', label: 'COST', color: '#3d5c3a', tint: '#eef2ec' },
  PERFORMANCE: { glyph: '♦', label: 'PERFORMANCE', color: '#8a6d1f', tint: '#f7f2e3' },
  CONFIG: { glyph: '♥', label: 'CONFIG', color: '#8f3a32', tint: '#f7ecea' },
};

export const RISK_COLORS: Record<string, { color: string; tint: string }> = {
  LOW: { color: '#2e6b4f', tint: '#e9f1ec' },
  MEDIUM: { color: '#a06a1e', tint: '#f7efe2' },
  HIGH: { color: '#9c3b2e', tint: '#f7e9e7' },
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
