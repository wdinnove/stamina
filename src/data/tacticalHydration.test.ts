import { describe, it, expect } from 'vitest';
import { hydrateTacticalActions, tacticalEventId } from './tacticalHydration';
import type { TacticalAction, TacticalDimension, TacticalDimensionOption } from './types';

const CAT = 'cat-1';
const dim = (id: string, name: string, slot: number): TacticalDimension =>
  ({ id, teamId: 't1', categoryId: CAT, name, normalizedName: name.toLowerCase(), sortOrder: slot, slot });
const opt = (dimensionId: string, label: string, code: number): TacticalDimensionOption =>
  ({ id: `${dimensionId}-${code}`, teamId: 't1', dimensionId, label, sortOrder: code, code });

const forme = dim('d-forme', 'Forme de jeu', 0);
const valeur = dim('d-valeur', 'Valeur', 1);
const zone = dim('d-zone', 'Zone', 2);
const dimensions = [forme, valeur, zone];
const options = [
  opt('d-forme', 'Protect', 1), opt('d-forme', 'Switch', 2),
  opt('d-zone', 'P-TOP 5', 1), opt('d-zone', 'P-SIDE 5', 2),
];

const action = (over: Partial<TacticalAction> = {}): TacticalAction => ({
  matchId: 'm1', categoryId: CAT, seq: 1, valeur: 2, options: [1, null, 2], playerIds: [], ...over,
});

describe('hydrateTacticalActions', () => {
  it('retraduit chaque code en libellé de catalogue, sur la bonne dimension', () => {
    const [event] = hydrateTacticalActions([action()], dimensions, options);
    expect(event.values).toEqual([
      { dimensionId: 'd-forme', label: 'Protect' },
      { dimensionId: 'd-zone', label: 'P-SIDE 5' },
      { dimensionId: 'd-valeur', label: '2' },
    ]);
  });

  it('adresse les options par slot, pas par ordre d\'affichage', () => {
    // La Zone est réordonnée en tête de l'affichage : son slot, lui, ne bouge pas.
    const reordered = [{ ...zone, sortOrder: 0 }, { ...forme, sortOrder: 2 }, valeur];
    const [event] = hydrateTacticalActions([action()], reordered, options);
    expect(event.values).toContainEqual({ dimensionId: 'd-zone', label: 'P-SIDE 5' });
    expect(event.values).toContainEqual({ dimensionId: 'd-forme', label: 'Protect' });
  });

  it('rend la valeur depuis sa colonne dédiée, jamais depuis les options', () => {
    const [event] = hydrateTacticalActions([action({ valeur: 0 })], dimensions, options);
    expect(event.values).toContainEqual({ dimensionId: 'd-valeur', label: '0' });
  });

  it('garde une action sans score, sans lui inventer de valeur', () => {
    const [event] = hydrateTacticalActions([action({ valeur: null })], dimensions, options);
    expect(event.values.some(v => v.dimensionId === 'd-valeur')).toBe(false);
    expect(event.values).toHaveLength(2);
  });

  it('ignore une case non renseignée', () => {
    const [event] = hydrateTacticalActions([action({ options: [null, null, 1] })], dimensions, options);
    expect(event.values).toEqual([
      { dimensionId: 'd-zone', label: 'P-TOP 5' },
      { dimensionId: 'd-valeur', label: '2' },
    ]);
  });

  it('ignore un code dont l\'option a été supprimée de la configuration', () => {
    const [event] = hydrateTacticalActions([action({ options: [99, null, 1] })], dimensions, options);
    expect(event.values.some(v => v.dimensionId === 'd-forme')).toBe(false);
  });

  it('ignore un slot dont la dimension a été supprimée', () => {
    const [event] = hydrateTacticalActions([action()], [valeur, zone], options);
    expect(event.values.some(v => v.dimensionId === 'd-forme')).toBe(false);
  });

  it('reporte les joueuses telles quelles', () => {
    const [event] = hydrateTacticalActions([action({ playerIds: ['p1', 'p2'] })], dimensions, options);
    expect(event.playerIds).toEqual(['p1', 'p2']);
  });

  it('donne une identité de calcul stable et distincte par action', () => {
    const events = hydrateTacticalActions([action({ seq: 1 }), action({ seq: 2 })], dimensions, options);
    expect(events.map(e => e.id)).toEqual(['m1:cat-1:1', 'm1:cat-1:2']);
    expect(tacticalEventId({ matchId: 'm1', categoryId: CAT, seq: 1 })).toBe('m1:cat-1:1');
  });
});
