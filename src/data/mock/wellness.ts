import type { WellnessEntry } from '../types';
import { players } from './players';

function generate(): WellnessEntry[] {
  const entries: WellnessEntry[] = [];
  const base = new Date('2026-01-15');
  const t1 = players.filter(p => p.teamId === 't1');

  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];

    t1.forEach((p, idx) => {
      const fatigue    = Math.min(10, Math.max(1, 5 + (idx % 3) + (i % 4 === 0 ? 2 : 0)));
      const mood       = Math.min(10, Math.max(1, 7 - (idx % 2) - (i % 5 === 0 ? 2 : 0)));
      const stress     = Math.min(10, Math.max(1, 4 + (idx % 3) + (i % 3 === 0 ? 1 : 0)));
      const motivation = Math.min(10, Math.max(1, 7 + (idx % 2) - (i % 4 === 0 ? 1 : 0)));
      const sleep      = Math.min(10, Math.max(1, 7 - (idx % 2) + (i % 3 === 0 ? -1 : 0)));
      const soreness   = Math.min(10, Math.max(1, 3 + (idx % 3) + (i % 3 === 0 ? 2 : 0)));
      const score      = Math.round(((10 - fatigue) + mood + (10 - stress) + motivation + sleep + (10 - soreness)) / 6 * 10) / 10;
      entries.push({ id: `well-${i}-${idx}`, playerId: p.id, date, fatigue, mood, stress, motivation, sleep, soreness, score });
    });
  }
  return entries;
}

export const wellnessEntries: WellnessEntry[] = generate();
