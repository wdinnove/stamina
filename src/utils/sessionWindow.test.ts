import { describe, it, expect } from 'vitest';
import {
  pivotSessionIndex, initialSessionWindow, expandSessionWindow, windowAround, WINDOW_SIZE,
} from './sessionWindow';

const sessions = (dates: string[]) => dates.map(date => ({ date }));

/** Saison longue (1er sept. → 10 oct. 2026) : de quoi avoir de la marge des deux côtés du pivot. */
const long = sessions(Array.from({ length: 40 }, (_, i) => {
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
  it('ouvre sur 3 séances avant le pivot et 6 après', () => {
    const w = initialSessionWindow(long, '2026-09-12');   // pivot = index 11
    expect(w).toEqual({ start: 8, end: 18 });
    expect(w.end - w.start).toBe(WINDOW_SIZE);
  });

  it('compense sur l\'avenir quand le pivot est en début de saison', () => {
    const w = initialSessionWindow(long, '2026-09-02');   // pivot = index 1
    expect(w).toEqual({ start: 0, end: 10 });
  });

  it('compense sur le passé quand le pivot est en fin de saison', () => {
    const w = initialSessionWindow(long, '2026-10-10');   // pivot = dernier index (39)
    expect(w).toEqual({ start: 30, end: 40 });
  });

  it('affiche tout quand la saison compte moins de 10 séances', () => {
    const list = sessions(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(initialSessionWindow(list, '2026-09-02')).toEqual({ start: 0, end: 3 });
  });

  it('ne casse pas sur une saison vide', () => {
    expect(initialSessionWindow([], '2026-09-02')).toEqual({ start: 0, end: 0 });
  });
});

describe('expandSessionWindow', () => {
  it('ajoute un lot vers le passé sans toucher à la borne droite', () => {
    expect(expandSessionWindow({ start: 20, end: 30 }, 40, 'before')).toEqual({ start: 10, end: 30 });
  });

  it('ajoute un lot vers l\'avenir sans toucher à la borne gauche', () => {
    expect(expandSessionWindow({ start: 20, end: 30 }, 40, 'after')).toEqual({ start: 20, end: 40 });
  });

  it('s\'arrête aux bornes de la saison', () => {
    expect(expandSessionWindow({ start: 4, end: 14 }, 40, 'before')).toEqual({ start: 0, end: 14 });
    expect(expandSessionWindow({ start: 20, end: 36 }, 40, 'after')).toEqual({ start: 20, end: 40 });
  });
});

describe('windowAround', () => {
  it('cadre la séance visée comme une fenêtre initiale', () => {
    expect(windowAround(20, 40)).toEqual({ start: 17, end: 27 });
  });

  it('reste dans la saison aux deux extrémités', () => {
    expect(windowAround(1, 40)).toEqual({ start: 0, end: 10 });
    expect(windowAround(39, 40)).toEqual({ start: 30, end: 40 });
  });
});
