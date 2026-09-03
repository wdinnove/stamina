import { describe, it, expect } from 'vitest';
import { buildActionPayloads, splitPlayerTokens } from './tacticalImport';
import type { ResolvedBlock } from './tacticalImport';
import { hydrateTacticalActions } from '../data/tacticalHydration';
import { buildDimensionTable, buildValueByEvent, findValueDimension } from '../data/tacticalAnalysis';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';
import type { TacticalAction, TacticalDimension, TacticalDimensionOption } from '../data/types';

const CAT = 'cat-pick';
const dim = (id: string, name: string, slot: number): TacticalDimension =>
  ({ id, teamId: 't1', categoryId: CAT, name, normalizedName: normalizeTacticalName(name), sortOrder: slot, slot });
const opt = (dimensionId: string, label: string, code: number): TacticalDimensionOption =>
  ({ id: `${dimensionId}-${code}`, teamId: 't1', dimensionId, label, sortOrder: code, code });

const forme  = dim('d-forme', 'Forme de jeu', 0);
const valeur = dim('d-valeur', 'Valeur', 1);
const zone   = dim('d-zone', 'Zone', 2);
const dimensions = [forme, valeur, zone];
const options = [
  opt('d-forme', 'Protect', 1), opt('d-forme', 'Switch', 2),
  opt('d-zone', 'P-TOP 5', 1), opt('d-zone', 'P-SIDE 5', 2),
];
const codeByLabel = new Map(options.map(o => [`${o.dimensionId}::${normalizeTacticalName(o.label)}`, o.code]));

/** Colonnes dans l'ordre du CSV : Joueuses, Forme de jeu, Zone, Valeur — volontairement
 *  différent de l'ordre des slots, pour vérifier que c'est bien le slot qui adresse. */
const block: ResolvedBlock = {
  categoryId: CAT,
  columnDimensions: [null, forme, zone, valeur],
  rows: [
    ['#0 Cynthia, #9 Lau', 'Protect', 'P-SIDE 5', '1'],
    ['#9 Lau',             'Switch',  'P-TOP 5',  '0'],
    ['',                   'Protect', '',         ''],
  ],
};
const playerIdByToken = { '#0 Cynthia': 'p0', '#9 Lau': 'p9' };

describe('buildActionPayloads', () => {
  const payload = buildActionPayloads([block], codeByLabel, playerIdByToken);

  it('range chaque code à la position du slot, pas à celle de la colonne', () => {
    expect(payload[0].options).toEqual([1, null, 2]);   // forme=slot 0, valeur=slot 1 (vide), zone=slot 2
  });

  it('sort la valeur des options pour la mettre dans sa colonne', () => {
    expect(payload.map(p => p.valeur)).toEqual([1, 0, null]);
  });

  it('numérote les actions à partir de 1, par catégorie', () => {
    expect(payload.map(p => p.seq)).toEqual([1, 2, 3]);
  });

  it('rapproche les joueuses, en ignorant les jetons non rapprochés', () => {
    expect(payload[0].player_ids).toEqual(['p0', 'p9']);
    expect(payload[2].player_ids).toEqual([]);
    const partiel = buildActionPayloads([block], codeByLabel, { '#0 Cynthia': 'p0' });
    expect(partiel[0].player_ids).toEqual(['p0']);
  });

  it('garde l\'action sans score au lieu de la jeter', () => {
    expect(payload).toHaveLength(3);
    expect(payload[2]).toMatchObject({ valeur: null, options: [1, null, null] });
  });

  it('reprend la numérotation quand deux blocs visent la même catégorie', () => {
    const deux = buildActionPayloads([block, block], codeByLabel, playerIdByToken);
    expect(deux.map(p => p.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('laisse la case vide pour une valeur absente du catalogue', () => {
    const inconnu: ResolvedBlock = { ...block, rows: [['', 'Trap', 'P-TOP 5', '2']] };
    expect(buildActionPayloads([inconnu], codeByLabel, {})[0].options).toEqual([null, null, 1]);
  });
});

describe('aller-retour import → stockage → analyse', () => {
  it('retrouve exactement les comptes du CSV après réhydratation', () => {
    const actions: TacticalAction[] = buildActionPayloads([block], codeByLabel, playerIdByToken)
      .map(p => ({ matchId: 'm1', categoryId: p.category_id, seq: p.seq, valeur: p.valeur, options: p.options, playerIds: p.player_ids }));
    const events = hydrateTacticalActions(actions, dimensions, options);

    const valueByEvent = buildValueByEvent(events, CAT, findValueDimension(dimensions, CAT));
    const table = buildDimensionTable(events, CAT, forme, valueByEvent, ['Protect', 'Switch']);

    expect(table.totalActions).toBe(3);
    expect(table.rows).toEqual([
      // 2 actions Protect, une seule notée (1) → rentabilité 1
      { label: 'Protect', actions: 2, sharePct: 2 / 3, valeur: 1, rentabilite: 1 },
      { label: 'Switch',  actions: 1, sharePct: 1 / 3, valeur: 0, rentabilite: 0 },
    ]);
    // L'action non notée compte dans les volumes sans peser sur la moyenne.
    expect(table.totalRentabilite).toBe(0.5);
  });
});

describe('splitPlayerTokens', () => {
  it('découpe la cellule et écarte les marqueurs vides', () => {
    expect(splitPlayerTokens('#0 Cynthia, #9 Lau')).toEqual(['#0 Cynthia', '#9 Lau']);
    expect(splitPlayerTokens('/, #9 Lau,  ')).toEqual(['#9 Lau']);
    expect(splitPlayerTokens('')).toEqual([]);
  });
});
