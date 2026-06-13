import type { PlayerStatus, ActionCategory, ActionPriority } from './types';

export const CURRENT_DATE = '2026-01-15';
export const CURRENT_TEAM_ID = 't1';
export const SEASON_LABEL = '2025/26';
export const TOTAL_SEASON_GAMES = 14;

export const statusConfig: Record<PlayerStatus, { label: string; color: string; bg: string }> = {
  active:      { label: 'Actif',        color: '#00E5A0', bg: 'rgba(0,229,160,0.12)'  },
  injured:     { label: 'Blessé',       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  limited:     { label: 'Limité',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  suspended:   { label: 'Suspendu',     color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  unavailable: { label: 'Indisponible', color: '#475569', bg: 'rgba(71,85,105,0.12)'  },
};

export const categoryConfig: Record<ActionCategory, { label: string; color: string }> = {
  medical:        { label: 'Médical',    color: '#EF4444' },
  physical:       { label: 'Physique',   color: '#00E5A0' },
  mental:         { label: 'Mental',     color: '#8B5CF6' },
  tactical:       { label: 'Tactique',   color: '#3B82F6' },
  administrative: { label: 'Admin.',     color: '#F59E0B' },
  interview:      { label: 'Entretien',  color: '#06b6d4' },
  video:          { label: 'Vidéo',      color: '#a78bfa' },
  discussion:     { label: 'Discussion', color: '#94A3B8' },
};

export const priorityConfig: Record<ActionPriority, { label: string; color: string }> = {
  low:      { label: 'Faible',   color: '#475569' },
  normal:   { label: 'Normale',  color: '#94A3B8' },
  high:     { label: 'Haute',    color: '#F59E0B' },
  critical: { label: 'Critique', color: '#EF4444' },
};

export const positionColors: Record<string, string> = {
  Meneur:       '#3B82F6',
  Arrière:      '#00E5A0',
  Ailier:       '#F59E0B',
  'Ailier Fort':'#fb923c',
  Pivot:        '#EF4444',
};
