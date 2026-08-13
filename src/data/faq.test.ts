import { describe, it, expect } from 'vitest';
import { FAQ_ENTRIES } from './faq';

describe('FAQ', () => {
  it('ne contient pas de doublon de question', () => {
    const seen = new Set<string>();
    for (const e of FAQ_ENTRIES) {
      expect(seen.has(e.question), `question en double : ${e.question}`).toBe(false);
      seen.add(e.question);
    }
  });

  it('donne une réponse substantielle à chaque question', () => {
    for (const e of FAQ_ENTRIES) {
      expect(e.answer.length, e.question).toBeGreaterThan(60);
      expect(e.theme, e.question).toBeTruthy();
    }
  });

  it('couvre les pièges de lecture identifiés pendant la revue', () => {
    const questions = FAQ_ENTRIES.map(e => e.question.toLowerCase()).join(' | ');
    // Chacun correspond à une confusion réellement rencontrée, pas à une entrée décorative.
    expect(questions).toContain('%usg');            // colonne qui avait induit en erreur
    expect(questions).toContain('moyenne d\'équipe'); // règle de moyenne non pondérée
    expect(questions).toContain('saison');           // objectifs qui « disparaissent »
    expect(questions).toContain('iphone');           // push iOS et PWA
  });
});
