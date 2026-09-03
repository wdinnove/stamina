import { describe, it, expect } from 'vitest';
import { buildDimensionTable, buildValueByEvent, buildCrossMatrix, buildCustomTableRows, findValueDimension } from './tacticalAnalysis';
import type { TacticalDimension, TacticalEvent } from './types';

const CAT = 'cat-1';
const DIM_ZONE  = 'dim-zone';
const DIM_VALUE = 'dim-value';
const DIM_ISSUE = 'dim-issue';

const dim = (id: string, name: string, sortOrder = 0): TacticalDimension => ({
  id, teamId: 't1', categoryId: CAT, name, normalizedName: name.toLowerCase(), sortOrder, slot: sortOrder,
});

const zoneDim  = dim(DIM_ZONE, 'Zone', 0);
const valueDim = dim(DIM_VALUE, 'Valeur', 1);
const issueDim = dim(DIM_ISSUE, 'Issue', 2);

let seq = 0;
/** Un événement : libellé de zone, valeur numérique, et éventuellement une issue. */
const ev = (zone: string, value?: string, issue?: string): TacticalEvent => ({
  id: `e${++seq}`, matchId: 'm1', categoryId: CAT, sequenceNumber: seq, playerIds: [],
  values: [
    { dimensionId: DIM_ZONE, label: zone },
    ...(value !== undefined ? [{ dimensionId: DIM_VALUE, label: value }] : []),
    ...(issue !== undefined ? [{ dimensionId: DIM_ISSUE, label: issue }] : []),
  ],
});

const valuesOf = (events: TacticalEvent[]) => buildValueByEvent(events, CAT, valueDim);

describe('findValueDimension', () => {
  it('repère la dimension « Valeur » quelle que soit la casse ou les accents', () => {
    expect(findValueDimension([zoneDim, dim('d', 'VALEUR')], CAT)?.id).toBe('d');
  });
});

describe('buildDimensionTable — regroupement par libellé normalisé', () => {
  /**
   * Cas de l'audit. Deux exports vidéo écrivent la même option différemment (« Panier » / « panier »).
   * Les valeurs d'événements sont stockées telles quelles ; sans normalisation, le rapport tactique
   * affichait deux lignes — l'une pouvant passer le seuil vert, l'autre non — alors que l'attribut
   * de rentabilité du même nom, lui, n'en voyait qu'une.
   */
  const events = [
    ev('Panier', '2'), ev('Panier', '2'),
    ev('panier', '0'), ev('PANIER', '0'),
  ];

  it('fusionne les variantes de casse en une seule ligne', () => {
    const t = buildDimensionTable(events, CAT, zoneDim, valuesOf(events));
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].actions).toBe(4);
    // (2 + 2 + 0 + 0) / 4 actions valuées = 1
    expect(t.rows[0].rentabilite).toBe(1);
  });

  it('affiche le premier libellé observé quand l\'option n\'est pas au catalogue', () => {
    const t = buildDimensionTable(events, CAT, zoneDim, valuesOf(events));
    expect(t.rows[0].label).toBe('Panier');
  });

  it('préfère le libellé du catalogue à celui observé dans les données', () => {
    const t = buildDimensionTable(events, CAT, zoneDim, valuesOf(events), ['PANIER']);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].label).toBe('PANIER');
    expect(t.rows[0].actions).toBe(4);
  });

  it('la répartition somme à 100 % après fusion', () => {
    const mixed = [ev('Panier', '1'), ev('panier', '1'), ev('Lancer', '1')];
    const t = buildDimensionTable(mixed, CAT, zoneDim, valuesOf(mixed));
    expect(t.rows).toHaveLength(2);
    expect(t.rows.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(1, 6);
  });

  it('la rentabilité ne compte que les actions réellement valuées', () => {
    // 3 actions, une seule porte une valeur : rentabilité = 4 / 1, pas 4 / 3.
    const partial = [ev('Panier', '4'), ev('panier'), ev('PANIER')];
    const t = buildDimensionTable(partial, CAT, zoneDim, valuesOf(partial));
    expect(t.rows[0].actions).toBe(3);
    expect(t.rows[0].rentabilite).toBe(4);
  });

  it('fusionne un groupe configuré même si les données varient de casse', () => {
    const g = [ev('P-SIDE 4', '2'), ev('p-side 5', '4')];
    const t = buildDimensionTable(g, CAT, zoneDim, valuesOf(g), [], [{ label: 'P-SIDE', options: ['P-SIDE 4', 'P-SIDE 5'] }]);
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].label).toBe('P-SIDE');
    expect(t.rows[0].actions).toBe(2);
    expect(t.rows[0].rentabilite).toBe(3);
  });
});

describe('buildCustomTableRows — même normalisation', () => {
  it('une ligne visant « Panier » attrape les variantes de casse', () => {
    const events = [ev('Panier', '2'), ev('panier', '4')];
    const res = buildCustomTableRows(events, [zoneDim, valueDim], [
      { label: 'Panier', refs: [{ categoryId: CAT, dimensionId: DIM_ZONE, option: 'PANIER' }] },
    ]);
    expect(res.rows[0].actions).toBe(2);
    expect(res.rows[0].rentabilite).toBe(3);
  });
});

describe('buildCrossMatrix — même normalisation, clés d\'affichage', () => {
  it('ne dédouble pas une option sur une variante de casse', () => {
    const events = [
      ev('Panier', '2', 'Réussi'),
      ev('panier', '0', 'reussi'),
      ev('Lancer', '1', 'Réussi'),
    ];
    const m = buildCrossMatrix(events, CAT, zoneDim, issueDim, valuesOf(events));
    expect(m.optionsX).toEqual(['Panier', 'Lancer']);
    expect(m.optionsY).toEqual(['Réussi']);
    // Les clés exposées utilisent les libellés d'affichage : c'est ainsi que les composants y accèdent.
    expect(m.cells.get('Panier::Réussi')?.actions).toBe(2);
    expect(m.cells.get('Panier::Réussi')?.rentabilite).toBe(1);
    expect(m.totalActions).toBe(3);
  });
});
