import { describe, it, expect } from 'vitest';
import { teamAverage, teamAverageOfField, EMPTY_TEAM_AVERAGE } from './teamAverage';
import { mean, roundedAvg } from './avg';

interface Entry { playerId: string; rpe: number }
const e = (playerId: string, rpe: number): Entry => ({ playerId, rpe });

const teamRpe = (entries: Entry[]) => teamAverageOfField(entries, x => x.playerId, x => x.rpe);
/** L'ancienne convention — moyenne à plat des lignes brutes, pondérée par l'assiduité. */
const flatAvg = (entries: Entry[]) => roundedAvg(entries.map(x => x.rpe));

describe('teamAverage — invariant de la règle', () => {
  it('est égal à la moyenne non pondérée des valeurs individuelles affichées', () => {
    const entries = [
      e('alice', 6), e('alice', 3), e('alice', 9),
      e('bea', 5), e('bea', 3), e('bea', 8),
      e('gaby', 9),
    ];
    // Valeurs individuelles telles qu'elles apparaissent dans la colonne joueurs
    const perPlayer = [mean([6, 3, 9])!, mean([5, 3, 8])!, 9];

    expect(teamRpe(entries).value).toBe(roundedAvg(perPlayer));
    expect(teamRpe(entries).players).toBe(3);
  });

  it('coïncide avec la moyenne à plat quand tous les joueurs ont le même nombre de saisies', () => {
    const entries = [
      e('alice', 6), e('alice', 8),
      e('bea', 4), e('bea', 5),
      e('chloe', 7), e('chloe', 9),
    ];
    expect(teamRpe(entries).value).toBe(flatAvg(entries));
  });

  it('diverge de la moyenne à plat dès que l\'assiduité est inégale', () => {
    // Semaine réelle : Chloé, Dina, Hana et Gaby ont sauté la séance de récupération, donc leur
    // moyenne perso ne contient que du dur. La moyenne à plat les sous-pondère.
    const entries = [
      e('alice', 6), e('alice', 3), e('alice', 9),
      e('bea', 5), e('bea', 3), e('bea', 8),
      e('chloe', 6), e('chloe', 9),
      e('dina', 5), e('dina', 8),
      e('hana', 6), e('hana', 8),
      e('elsa', 4), e('elsa', 4), e('elsa', 7),
      e('fanny', 3), e('fanny', 3),
      e('gaby', 9),
    ];
    expect(flatAvg(entries)).toBe(5.9);          // 106 / 18 — ancienne convention
    expect(teamRpe(entries).value).toBe(6.2);     // 49,33 / 8 — nouvelle règle
    expect(teamRpe(entries).players).toBe(8);
  });

  it('vérifie l\'identité écart = Cov(nb saisies, moyenne perso) / nb moyen de saisies', () => {
    const entries = [
      e('alice', 6), e('alice', 6),
      e('bea', 10),
    ];
    const counts = [2, 1];
    const means  = [6, 10];
    const nBar   = mean(counts)!;
    const cov    = mean(counts.map((n, i) => n * means[i]))! - nBar * mean(means)!;

    // L'identité porte sur les valeurs exactes : on la vérifie donc avant tout arrondi
    // (l'API, elle, arrondit à 1 décimale — cf. les tests ci-dessus).
    const exactFlat = mean(entries.map(x => x.rpe))!;
    const exactTeam = mean(means)!;
    expect(exactFlat - exactTeam).toBeCloseTo(cov / nBar, 12);
  });
});

describe('teamAverage — joueurs sans valeur', () => {
  it('exclut du calcul ET du décompte un joueur dont la valeur est null', () => {
    const rows = [
      { playerId: 'alice', v: 4 },
      { playerId: 'bea', v: 8 },
      { playerId: 'sansdonnee', v: null as number | null },
    ];
    const res = teamAverage(rows, r => r.playerId, playerRows => {
      const vals = playerRows.map(r => r.v).filter((x): x is number => x !== null);
      return mean(vals);
    });
    expect(res).toEqual({ value: 6, players: 2 });
  });

  it('ne compte qu\'une fois un joueur ayant plusieurs lignes', () => {
    const entries = [e('alice', 5), e('alice', 5), e('alice', 5), e('bea', 9)];
    expect(teamRpe(entries).players).toBe(2);
    expect(teamRpe(entries).value).toBe(7);
  });

  it('renvoie une valeur nulle et un décompte nul sur une liste vide', () => {
    expect(teamRpe([])).toEqual(EMPTY_TEAM_AVERAGE);
  });
});

describe('teamAverage — arrondis', () => {
  it('n\'arrondit pas la valeur individuelle avant la moyenne d\'équipe', () => {
    // Cas discriminant : arrondir chaque joueur d'abord donnerait (0,3+0,3+0,3+0,2)/4 = 0,275
    // → 0,3, alors que la vraie moyenne est 0,2475 → 0,2. Un double arrondi ferait donc échouer
    // ce test, c'est tout son intérêt.
    const rows = [
      { playerId: 'a', v: 0.25 },
      { playerId: 'b', v: 0.25 },
      { playerId: 'c', v: 0.25 },
      { playerId: 'd', v: 0.24 },
    ];
    expect(teamAverageOfField(rows, r => r.playerId, r => r.v).value).toBe(0.2);
  });
});
