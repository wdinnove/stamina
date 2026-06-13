import type { RPEEntry, SessionType } from '../types';
import { players } from './players';

function generate(): RPEEntry[] {
  const entries: RPEEntry[] = [];
  const base = new Date('2026-01-15');
  const t1 = players.filter(p => p.teamId === 't1');

  for (let i = 0; i < 30; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];

    const isMatch = i % 7 === 0;
    const isRest  = i % 7 >= 5;
    const sessionType: SessionType = isMatch ? 'match' : isRest ? 'rest' : 'training';
    if (sessionType === 'rest') continue;

    t1.forEach((p, idx) => {
      if (p.status === 'injured') return;
      const rpe = Math.min(10, Math.max(1,
        (isMatch ? 8 : 6) + (idx % 3) - 1 + (i % 3 === 0 ? 1 : 0)
      ));
      entries.push({
        id: `rpe-${i}-${idx}`,
        playerId: p.id,
        date,
        sessionType,
        duration: isMatch ? 40 : 90,
        rpe,
      });
    });
  }
  return entries;
}

export const rpeEntries: RPEEntry[] = generate();
