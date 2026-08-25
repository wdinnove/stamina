import { describe, it, expect } from 'vitest';
import {
  composeGroups, paginateGroups, groupScopeLabel, type ReportScope,
} from './reportComposition';

type Key = 'rpe' | 'wellness' | 'medical';

const SECTIONS = [
  { key: 'rpe' as const,      label: 'Charge' },
  { key: 'wellness' as const, label: 'Bien-être' },
  { key: 'medical' as const,  label: 'Médical' },
];

interface P { id: string; name: string }
const roster: P[] = [{ id: 'a', name: 'ADAM Lise' }, { id: 'b', name: 'BLOT Zoé' }, { id: 'c', name: 'CROS Mia' }];
const name = (p: P) => p.name;

const none: ReportScope = { team: false, players: [] };
const scopes = (over: Partial<Record<Key, ReportScope>>): Record<Key, ReportScope> =>
  ({ rpe: none, wellness: none, medical: none, ...over });

const compose = (over: Partial<Record<Key, ReportScope>>) =>
  composeGroups(SECTIONS, scopes(over), roster, name);

describe('composeGroups', () => {
  it("place l'équipe en premier, puis les joueurs dans l'ordre de l'effectif", () => {
    const groups = compose({
      rpe:      { team: true, players: ['c', 'a'] },
      wellness: { team: true, players: ['a'] },
    });
    expect(groups.map(g => g.subject)).toEqual(['Équipe', 'ADAM Lise', 'CROS Mia']);
    expect(groups.map(g => g.index)).toEqual(['01', '02', '03']);
  });

  it('enchaîne toutes les sections d’un joueur sous son propre sujet', () => {
    const groups = compose({
      rpe:      { team: false, players: ['a'] },
      wellness: { team: false, players: ['a'] },
      medical:  { team: false, players: ['a'] },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].blocks.map(b => b.label)).toEqual(['Charge', 'Bien-être', 'Médical']);
    expect(groups[0].blocks.map(b => b.index)).toEqual(['01.1', '01.2', '01.3']);
  });

  it('omet un sujet sans aucune section', () => {
    const groups = compose({ rpe: { team: false, players: ['b'] } });
    expect(groups.map(g => g.id)).toEqual(['b']);
  });

  it('ignore un joueur sélectionné absent de l’effectif', () => {
    const groups = compose({ rpe: { team: false, players: ['zz', 'a'] } });
    expect(groups.map(g => g.id)).toEqual(['a']);
  });

  it('ne compose rien quand rien n’est sélectionné', () => {
    expect(compose({})).toEqual([]);
  });
});

describe('paginateGroups', () => {
  const opts = (heights: Record<string, number>) =>
    ({ available: 1000, heights, gap: 20, stripHeight: 70 });

  it('enchaîne deux sections courtes sur une même page', () => {
    const groups = compose({
      rpe:      { team: false, players: ['a'] },
      wellness: { team: false, players: ['a'] },
    });
    const pages = paginateGroups(groups, opts({ 'a-rpe': 400, 'a-wellness': 400 }));
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks.map(b => b.section)).toEqual(['rpe', 'wellness']);
  });

  it('passe à la page suivante quand le bloc ne tient plus, espacement compris', () => {
    const groups = compose({
      rpe:      { team: false, players: ['a'] },
      wellness: { team: false, players: ['a'] },
    });
    // 500 + 20 (gap) + 420 = 940 ≤ 930 ? non : la place utile n'est que de 1000 − 70 (bandeau).
    const pages = paginateGroups(groups, opts({ 'a-rpe': 500, 'a-wellness': 420 }));
    expect(pages).toHaveLength(2);
    expect(pages[0].blocks.map(b => b.section)).toEqual(['rpe']);
    expect(pages[1].blocks.map(b => b.section)).toEqual(['wellness']);
  });

  it('réserve la hauteur du bandeau aux sujets joueurs, pas à l’équipe', () => {
    const teamGroups = composeGroups(SECTIONS, scopes({
      rpe: { team: true, players: [] }, wellness: { team: true, players: [] },
    }), roster, name);
    // 950 + 20 + 30 = 1000 : tient tout juste sans bandeau.
    const pages = paginateGroups(teamGroups, opts({ 'team-rpe': 950, 'team-wellness': 30 }));
    expect(pages).toHaveLength(1);
  });

  it('ne mélange jamais deux sujets sur une même page', () => {
    const groups = compose({ rpe: { team: true, players: ['a', 'b'] } });
    const pages = paginateGroups(groups, opts({ 'team-rpe': 100, 'a-rpe': 100, 'b-rpe': 100 }));
    expect(pages).toHaveLength(3);
    expect(pages.map(p => p.groupId)).toEqual(['team', 'a', 'b']);
  });

  it('donne une page entière à un bloc non encore mesuré', () => {
    const groups = compose({
      rpe:      { team: false, players: ['a'] },
      wellness: { team: false, players: ['a'] },
    });
    const pages = paginateGroups(groups, opts({}));
    expect(pages).toHaveLength(2);
  });

  it('isole un bloc plus haut que la page sans perdre les suivants', () => {
    const groups = compose({
      rpe:      { team: false, players: ['a'] },
      wellness: { team: false, players: ['a'] },
    });
    const pages = paginateGroups(groups, opts({ 'a-rpe': 2000, 'a-wellness': 200 }));
    expect(pages.map(p => p.blocks.map(b => b.section))).toEqual([['rpe'], ['wellness']]);
  });
});

describe('groupScopeLabel', () => {
  it('liste les sections du sujet', () => {
    const groups = compose({
      rpe:     { team: true, players: [] },
      medical: { team: true, players: [] },
    });
    expect(groupScopeLabel(groups[0])).toBe('Charge · Médical');
  });
});
