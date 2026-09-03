import { describe, it, expect } from 'vitest';
import {
  pivotSessionIndex, initialSessionWindow, expandSessionWindow, windowAround, WINDOW_SIZE,
} from './sessionWindow';

const sessions = (dates: string[]) => dates.map(date => ({ date }));

/** Saison longue (1er sept. → 9 nov. 2026) : de quoi avoir de la marge des deux côtés du pivot. */
const long = sessions(Array.from({ length: 70 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 1 + i));
  return d.toISOString().slice(0, 10);
}));

describe('pivotSessionIndex', () => {
  it('choisit la séance du jour quand elle existe', () => {
    expect(pivotSessionIndex(long, '2026-09-12')).toBe(11);
  });

  it('choisit la PROCHAINE séance quand il n\'y en a pas aujourd\'hui', () => {
    const list = sessions(['2026-09-01', '2026-09-08', '2026-09-15']);
    expect(pivotSessionIndex(list, '2026-09-10')).toBe(2);
  });

  it('retombe sur la dernière séance quand la saison est finie', () => {
    const list = sessions(['2026-09-01', '2026-09-08']);
    expect(pivotSessionIndex(list, '2026-10-01')).toBe(1);
  });

  it('renvoie -1 sans séance', () => {
    expect(pivotSessionIndex([], '2026-09-10')).toBe(-1);
  });
});

describe('initialSessionWindow', () => {
  it('ouvre sur 6 séances avant le pivot et 13 après', () => {
    const w = initialSessionWindow(long, '2026-09-12');   // pivot = index 11
    expect(w).toEqual({ start: 5, end: 25 });
    expect(w.end - w.start).toBe(WINDOW_SIZE);
  });

  it('compense sur l\'avenir quand le pivot est en début de saison', () => {
    const w = initialSessionWindow(long, '2026-09-02');   // pivot = index 1
    expect(w).toEqual({ start: 0, end: 20 });
  });

  it('compense sur le passé quand le pivot est en fin de saison', () => {
    const w = initialSessionWindow(long, '2026-11-09');   // pivot = dernier index (69)
    expect(w).toEqual({ start: 50, end: 70 });
  });

  it('affiche tout quand la saison compte moins de 20 séances', () => {
    const list = sessions(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(initialSessionWindow(list, '2026-09-02')).toEqual({ start: 0, end: 3 });
  });

  it('ne casse pas sur une saison vide', () => {
    expect(initialSessionWindow([], '2026-09-02')).toEqual({ start: 0, end: 0 });
  });
});

describe('expandSessionWindow', () => {
  it('ajoute un lot vers le passé sans toucher à la borne droite', () => {
    expect(expandSessionWindow({ start: 30, end: 50 }, 70, 'before')).toEqual({ start: 10, end: 50 });
  });

  it('ajoute un lot vers l\'avenir sans toucher à la borne gauche', () => {
    expect(expandSessionWindow({ start: 30, end: 50 }, 70, 'after')).toEqual({ start: 30, end: 70 });
  });

  it('s\'arrête aux bornes de la saison', () => {
    expect(expandSessionWindow({ start: 4, end: 24 }, 70, 'before')).toEqual({ start: 0, end: 24 });
    expect(expandSessionWindow({ start: 20, end: 56 }, 70, 'after')).toEqual({ start: 20, end: 70 });
  });
});

describe('windowAround', () => {
  it('cadre la séance visée comme une fenêtre initiale', () => {
    expect(windowAround(30, 70)).toEqual({ start: 24, end: 44 });
  });

  it('reste dans la saison aux deux extrémités', () => {
    expect(windowAround(1, 70)).toEqual({ start: 0, end: 20 });
    expect(windowAround(69, 70)).toEqual({ start: 50, end: 70 });
  });
});
