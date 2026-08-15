import { describe, it, expect } from 'vitest';
import { teamWellnessAvg, aggregateTeamWellnessDaily } from './wellness';
import { roundedAvg } from './avg';
import type { WellnessEntry } from '../data/types';

/** Entrée minimale : seules la date, le joueur et les métriques comptent pour ces tests. */
const entry = (playerId: string, date: string, score: number, fatigue = 5): WellnessEntry => ({
  id: `${playerId}-${date}-${score}`, playerId, date, score,
  fatigue, mood: 5, stress: 5, motivation: 5, sleep: 5, soreness: 5,
} as WellnessEntry);

describe('teamWellnessAvg — une voix par joueur', () => {
  it('ne laisse pas la fréquence de saisie pondérer le score d\'équipe', () => {
    // Alice saisit tous les jours et va bien ; Bea saisit une fois et va mal.
    const entries = [
      entry('alice', '2026-01-05', 8), entry('alice', '2026-01-06', 8),
      entry('alice', '2026-01-07', 8), entry('alice', '2026-01-08', 8),
      entry('bea', '2026-01-06', 3),
    ];
    // Moyenne à plat : (8×4 + 3) / 5 = 7,0 — Bea est presque effacée.
    expect(roundedAvg(entries.map(e => e.score))).toBe(7);
    // Règle d'équipe : (8 + 3) / 2 = 5,5
    expect(teamWellnessAvg(entries)).toEqual({ value: 5.5, players: 2 });
  });

  it('agrège n\'importe quelle dimension, pas seulement le score', () => {
    const entries = [
      entry('alice', '2026-01-05', 8, 2), entry('alice', '2026-01-06', 8, 4), // fatigue moy. 3
      entry('bea', '2026-01-05', 5, 9),                                        // fatigue 9
    ];
    expect(teamWellnessAvg(entries, 'fatigue')).toEqual({ value: 6, players: 2 });
  });

  it('vaut la moyenne personnelle quand le périmètre ne contient qu\'un joueur', () => {
    const entries = [entry('alice', '2026-01-05', 6), entry('alice', '2026-01-06', 8)];
    expect(teamWellnessAvg(entries)).toEqual({ value: 7, players: 1 });
  });

  it('renvoie une valeur nulle sans saisie', () => {
    expect(teamWellnessAvg([])).toEqual({ value: null, players: 0 });
  });
});

describe('aggregateTeamWellnessDaily', () => {
  it('ne compte pas double un joueur ayant saisi deux fois le même jour', () => {
    const entries = [
      entry('alice', '2026-01-05', 4), entry('alice', '2026-01-05', 6), // sa journée : 5
      entry('bea', '2026-01-05', 9),
    ];
    const daily = aggregateTeamWellnessDaily(entries);
    expect(daily).toHaveLength(1);
    // Moyenne à plat des 3 saisies donnerait (4+6+9)/3 = 6,3 ; la règle donne (5+9)/2 = 7
    expect(daily[0].score).toBe(7);
  });

  it('produit un point par date, trié par la clé de date', () => {
    const entries = [
      entry('alice', '2026-01-05', 6), entry('bea', '2026-01-05', 8),
      entry('alice', '2026-01-06', 4),
    ];
    const daily = aggregateTeamWellnessDaily(entries);
    expect(daily.map(d => [d.date, d.score])).toEqual([
      ['2026-01-05', 7],
      ['2026-01-06', 4],
    ]);
  });
});
