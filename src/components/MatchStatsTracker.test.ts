import { describe, it, expect } from 'vitest';
import { resolveSubstitution } from './MatchStatsTracker';

const FIVE = ['p1', 'p2', 'p3', 'p4', 'p5'];

describe('resolveSubstitution', () => {
  it('fait entrer directement tant que le cinq est incomplet', () => {
    expect(resolveSubstitution(['p1'], null, 'us', 'p2', 'bench')).toEqual({ kind: 'enter', incoming: 'p2' });
  });

  it('ne fait rien sur un tap au banc sans sortante désignée', () => {
    // La régression à ne jamais réintroduire : ce tap sortait la joueuse « armée pour la saisie ».
    expect(resolveSubstitution(FIVE, null, 'us', 'p9', 'bench')).toEqual({ kind: 'none' });
  });

  it('désigne la sortante au premier tap sur le terrain', () => {
    expect(resolveSubstitution(FIVE, null, 'us', 'p3', 'court')).toEqual({ kind: 'mark', id: 'p3', from: 'court' });
  });

  it('échange dans les deux sens du geste', () => {
    expect(resolveSubstitution(FIVE, { side: 'us', id: 'p3', from: 'court' }, 'us', 'p9', 'bench'))
      .toEqual({ kind: 'swap', incoming: 'p9', outgoing: 'p3' });
    expect(resolveSubstitution(FIVE, { side: 'us', id: 'p9', from: 'bench' }, 'us', 'p3', 'court'))
      .toEqual({ kind: 'swap', incoming: 'p9', outgoing: 'p3' });
  });

  it('annule en retapant la même joueuse', () => {
    expect(resolveSubstitution(FIVE, { side: 'us', id: 'p3', from: 'court' }, 'us', 'p3', 'court')).toEqual({ kind: 'clear' });
  });

  it('déplace la désignation en tapant une autre joueuse du même côté', () => {
    expect(resolveSubstitution(FIVE, { side: 'us', id: 'p3', from: 'court' }, 'us', 'p4', 'court'))
      .toEqual({ kind: 'mark', id: 'p4', from: 'court' });
  });

  it('ne croise jamais les deux bancs', () => {
    // Une sortante désignée chez nous ne peut pas être remplacée par une adverse : le tap adverse
    // recommence de son côté au lieu de fabriquer un changement croisé.
    const oppFive = ['o1', 'o2', 'o3', 'o4', 'o5'];
    expect(resolveSubstitution(oppFive, { side: 'us', id: 'p3', from: 'court' }, 'them', 'o2', 'court'))
      .toEqual({ kind: 'mark', id: 'o2', from: 'court' });
    expect(resolveSubstitution(oppFive, { side: 'us', id: 'p3', from: 'court' }, 'them', 'o9', 'bench'))
      .toEqual({ kind: 'none' });
  });
});
