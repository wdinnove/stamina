import { describe, it, expect } from 'vitest';
import { filterNotes, hasNoteFilter, notePlainText } from './notes';
import type { PlayerNote } from '../data/types';

function note(over: Partial<PlayerNote> = {}): PlayerNote {
  return {
    id: 'n1', playerId: 'p1', teamId: 't1', seasonId: 's1',
    date: '2026-01-10', category: 'entretien', content: '<p>Entretien de reprise</p>',
    ...over,
  };
}

describe('notePlainText', () => {
  it('retire les balises sans coller les mots entre eux', () => {
    expect(notePlainText('<p>Bon <strong>état</strong></p><p>d\'esprit</p>'))
      .toBe("Bon état d'esprit");
  });

  it('décode les entités courantes', () => {
    expect(notePlainText('<p>Charge&nbsp;&amp;&nbsp;fatigue</p>')).toBe('Charge & fatigue');
  });
});

describe('filterNotes', () => {
  const notes = [
    note({ id: 'a', playerId: 'p1', date: '2026-01-10', category: 'entretien',    content: '<p>Point de reprise après blessure</p>' }),
    note({ id: 'b', playerId: 'p2', date: '2026-01-12', category: 'comportement', content: '<p>Retard à l\'échauffement</p>' }),
    note({ id: 'c', playerId: 'p1', date: '2026-01-05', category: 'match',        content: '<p>A très bien géré la fin de match</p>' }),
  ];

  it('trie du plus récent au plus ancien', () => {
    expect(filterNotes(notes).map(n => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('départage deux notes du même jour par ordre de saisie', () => {
    const sameDay = [
      note({ id: 'tôt',  date: '2026-01-10', createdAt: '2026-01-10T08:00:00Z' }),
      note({ id: 'tard', date: '2026-01-10', createdAt: '2026-01-10T19:00:00Z' }),
    ];
    expect(filterNotes(sameDay).map(n => n.id)).toEqual(['tard', 'tôt']);
  });

  it('filtre par joueur', () => {
    expect(filterNotes(notes, { playerId: 'p1' }).map(n => n.id)).toEqual(['a', 'c']);
  });

  it('filtre par catégorie', () => {
    expect(filterNotes(notes, { category: 'comportement' }).map(n => n.id)).toEqual(['b']);
  });

  it('cherche dans le texte, pas dans les balises', () => {
    expect(filterNotes(notes, { search: 'échauffement' }).map(n => n.id)).toEqual(['b']);
    // « strong », « p », « br » ne doivent jamais matcher du balisage
    expect(filterNotes([note({ content: '<p><strong>calme</strong></p>' })], { search: 'strong' })).toEqual([]);
  });

  it('ignore la casse et les accents', () => {
    expect(filterNotes(notes, { search: 'ECHAUFFEMENT' }).map(n => n.id)).toEqual(['b']);
    expect(filterNotes(notes, { search: 'gere' }).map(n => n.id)).toEqual(['c']);
  });

  it('combine les filtres', () => {
    expect(filterNotes(notes, { playerId: 'p1', search: 'match' }).map(n => n.id)).toEqual(['c']);
    expect(filterNotes(notes, { playerId: 'p2', category: 'entretien' })).toEqual([]);
  });

  it('ne filtre rien avec une recherche vide ou faite d\'espaces', () => {
    expect(filterNotes(notes, { search: '   ' })).toHaveLength(3);
    expect(filterNotes(notes, {})).toHaveLength(3);
  });
});

describe('hasNoteFilter', () => {
  it('ne se déclenche que sur un filtre réellement actif', () => {
    expect(hasNoteFilter({})).toBe(false);
    expect(hasNoteFilter({ search: '  ' })).toBe(false);
    expect(hasNoteFilter({ playerId: 'p1' })).toBe(true);
    expect(hasNoteFilter({ category: 'perso' })).toBe(true);
    expect(hasNoteFilter({ search: 'reprise' })).toBe(true);
  });
});
