import { describe, it, expect } from 'vitest';
import { elapsedAt, isExpired, freeze, seek, remainingAt, parseClockInput, periodSeconds, absoluteSeconds, PAUSED_AT_ZERO } from './matchClock';

const T0 = 1_700_000_000_000;
const PERIOD = 600;   // 10 minutes
const running = (base: number, startedAt = T0) => ({ baseSeconds: base, startedAt });

describe('elapsedAt', () => {
  it('ne bouge pas à l\'arrêt', () => {
    expect(elapsedAt({ baseSeconds: 42, startedAt: null }, T0 + 60_000, PERIOD)).toBe(42);
  });

  it('suit l\'horloge murale, pas le nombre de tics', () => {
    // Le cas qui cassait tout : l'onglet en arrière-plan ne reçoit qu'un tic par minute, et
    // l'appareil endormi n'en reçoit aucun. Le temps doit rester juste au réveil.
    expect(elapsedAt(running(0), T0 + 125_000, PERIOD)).toBe(125);
  });

  it('s\'arrête à la fin du quart-temps, quoi qu\'il arrive', () => {
    expect(elapsedAt(running(0), T0 + 900_000, PERIOD)).toBe(PERIOD);
    expect(elapsedAt(running(590), T0 + 60_000, PERIOD)).toBe(PERIOD);
  });

  it('ne descend jamais sous zéro', () => {
    expect(elapsedAt({ baseSeconds: -30, startedAt: null }, T0, PERIOD)).toBe(0);
  });
});

describe('isExpired', () => {
  it('signale la fin du quart-temps pour que l\'appelant arrête le chrono', () => {
    expect(isExpired(running(0), T0 + 599_000, PERIOD)).toBe(false);
    expect(isExpired(running(0), T0 + 600_000, PERIOD)).toBe(true);
  });
});

describe('freeze', () => {
  it('fige le temps couru et arrête le chrono', () => {
    expect(freeze(running(10), T0 + 30_000, PERIOD)).toEqual({ baseSeconds: 40, startedAt: null });
  });

  it('fige au plus à la fin du quart-temps', () => {
    expect(freeze(running(0), T0 + 900_000, PERIOD)).toEqual({ baseSeconds: PERIOD, startedAt: null });
  });
});

describe('seek', () => {
  it('conserve l\'état de marche : corriger le temps n\'arrête pas le chrono', () => {
    expect(seek(running(100), 250, T0 + 5_000, PERIOD)).toEqual({ baseSeconds: 250, startedAt: T0 + 5_000 });
    expect(seek(PAUSED_AT_ZERO, 250, T0, PERIOD)).toEqual({ baseSeconds: 250, startedAt: null });
  });

  it('borne au quart-temps dans les deux sens', () => {
    expect(seek(PAUSED_AT_ZERO, 9999, T0, PERIOD).baseSeconds).toBe(PERIOD);
    expect(seek(PAUSED_AT_ZERO, -50, T0, PERIOD).baseSeconds).toBe(0);
  });
});

describe('remainingAt', () => {
  it('décompte, et ne passe jamais sous zéro', () => {
    expect(remainingAt(running(0), T0 + 60_000, PERIOD)).toBe(540);
    expect(remainingAt(running(0), T0 + 900_000, PERIOD)).toBe(0);
  });
});

describe('parseClockInput', () => {
  it('lit les formes qu\'on tape vraiment', () => {
    expect(parseClockInput('07:30')).toBe(450);
    expect(parseClockInput('7:30')).toBe(450);
    expect(parseClockInput(' 45 ')).toBe(45);
  });

  it('rend null sur une saisie illisible plutôt qu\'un temps inventé', () => {
    expect(parseClockInput('7:5')).toBe(425);   // 7 min 05, forme tolérée
    expect(parseClockInput('7:75')).toBeNull(); // 75 secondes n'existent pas
    expect(parseClockInput('abc')).toBeNull();
    expect(parseClockInput('')).toBeNull();
  });
});

describe('periodSeconds', () => {
  it('donne la durée réglementaire jusqu\'au quatrième quart-temps', () => {
    expect(periodSeconds(1, 600)).toBe(600);
    expect(periodSeconds(4, 600)).toBe(600);
  });

  it('donne 5 minutes en prolongation, même en catégorie jeune', () => {
    expect(periodSeconds(5, 600)).toBe(300);
    expect(periodSeconds(7, 480)).toBe(300);
  });
});

describe('absoluteSeconds', () => {
  it('met les quarts-temps bout à bout', () => {
    expect(absoluteSeconds(1, 0, 600)).toBe(0);
    expect(absoluteSeconds(3, 120, 600)).toBe(1320);
  });

  it('compte les prolongations à 5 minutes, pas à la durée d\'un quart-temps', () => {
    // Q5 commence à 40 min, et non à 40 min quoi qu'il arrive ensuite.
    expect(absoluteSeconds(5, 0, 600)).toBe(2400);
    // Q6 commence 5 minutes après, pas 10.
    expect(absoluteSeconds(6, 60, 600)).toBe(2400 + 300 + 60);
  });

  it('suit la durée réglementaire choisie', () => {
    expect(absoluteSeconds(3, 0, 480)).toBe(960);
    expect(absoluteSeconds(5, 0, 480)).toBe(1920);
  });
});
