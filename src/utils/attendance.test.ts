import { describe, it, expect } from 'vitest';
import { presenceRate, teamPresenceRate, presenceColor } from './attendance';

const P = { status: 'present' as const };
const A = { status: 'absent' as const };
const L = { status: 'late' as const };

describe('presenceRate', () => {
  it('compte un joueur en retard comme présent — il a participé', () => {
    expect(presenceRate([P, L, A, A])).toBe(50);
  });

  it('renvoie null si aucune séance attendue', () => {
    expect(presenceRate([])).toBeNull();
  });
});

describe('teamPresenceRate — moyenne non pondérée des taux individuels', () => {
  it('ne laisse pas le nombre de séances attendues pondérer le résultat', () => {
    // Alice : 20 séances, 100 % · Bea : arrivée en cours de saison, 2 séances, 0 %
    const players = [
      { playerId: 'alice', attendance: Array(20).fill(P) },
      { playerId: 'bea',   attendance: [A, A] },
    ];
    // Σprésences / Σattendus donnerait 20/22 = 91 % — Bea y disparaît presque.
    expect(teamPresenceRate(players)).toEqual({ value: 50, players: 2 });
  });

  it('exclut du calcul et du décompte un joueur sans séance attendue', () => {
    const players = [
      { playerId: 'alice', attendance: [P, P, A, A] },   // 50 %
      { playerId: 'bea',   attendance: [P, P, P, A] },   // 75 %
      { playerId: 'chloe', attendance: [] },             // pas de donnée
    ];
    expect(teamPresenceRate(players)).toEqual({ value: 62.5, players: 2 });
  });

  it('renvoie une valeur nulle sur un effectif vide', () => {
    expect(teamPresenceRate([])).toEqual({ value: null, players: 0 });
  });
});

describe('presenceColor', () => {
  it('applique les mêmes seuils pour un joueur et pour l\'équipe', () => {
    expect(presenceColor(85)).toBe('#00E5A0');
    expect(presenceColor(84)).toBe('#F59E0B');
    expect(presenceColor(70)).toBe('#F59E0B');
    expect(presenceColor(69)).toBe('#EF4444');
    expect(presenceColor(null)).toBe('#475569');
  });
});
