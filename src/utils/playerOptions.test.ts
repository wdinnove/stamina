import { describe, it, expect } from 'vitest';
import { historyPlayerOptions } from './playerOptions';

const p = (id: string) => ({ id });

const roster = [p('a'), p('b')];
const org    = [p('a'), p('b'), p('invitee'), p('autre-equipe'), p('partie')];

describe('historyPlayerOptions', () => {
  it("s'en tient à l'effectif quand aucun partenaire n'est venu", () => {
    expect(historyPlayerOptions(roster, org, []).map(x => x.id)).toEqual(['a', 'b']);
  });

  it('ajoute les partenaires de la saison, jamais le reste du club', () => {
    expect(historyPlayerOptions(roster, org, ['invitee']).map(x => x.id)).toEqual(['a', 'b', 'invitee']);
  });

  it('ne double pas un partenaire déjà rattaché à l\'effectif', () => {
    expect(historyPlayerOptions(roster, org, ['a', 'invitee']).map(x => x.id)).toEqual(['a', 'b', 'invitee']);
  });

  it('garde sélectionnable un joueur ouvert par lien direct, hors effectif et hors partenaires', () => {
    expect(historyPlayerOptions(roster, org, [], 'partie').map(x => x.id)).toEqual(['a', 'b', 'partie']);
  });

  it('ne rajoute pas le joueur sélectionné quand il est déjà dans la liste', () => {
    expect(historyPlayerOptions(roster, org, [], 'b').map(x => x.id)).toEqual(['a', 'b']);
  });

  it('ignore un id sélectionné introuvable dans le club (liste pas encore chargée)', () => {
    expect(historyPlayerOptions(roster, [], ['invitee'], 'inconnu').map(x => x.id)).toEqual(['a', 'b']);
  });
});
