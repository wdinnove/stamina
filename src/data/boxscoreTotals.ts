/**
 * Écart entre le total d'ÉQUIPE d'un match et la somme de ses lignes individuelles. Fonctions
 * pures.
 *
 * Toutes les actions d'un match n'ont pas d'auteur : un rebond d'équipe, un ballon perdu sur les
 * 24 secondes, et surtout tout ce qu'on pointe « sans joueur » chez l'adversaire. Ces actions
 * comptent aux totaux collectifs (`team_match_stats`, d'où sortent les four factors, les ratios
 * par possession et le bilan de saison) mais, par construction, à aucune ligne individuelle.
 *
 * La ligne « Totaux » du boxscore additionnait les individuelles : elle annonçait donc moins de
 * rebonds que l'onglet Four factors du même match, sans que rien ne dise pourquoi. C'est la ligne
 * « Équipe » de la feuille de marque FIBA qui manquait — ni plus, ni moins.
 */
import type { TeamMatchStat } from './types';

export interface StatLine {
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number;  fta: number;
  ro: number; rd: number;
  pd: number; ct: number; intercepts: number; bp: number;
  fte: number; fpr: number;
}

const EMPTY: StatLine = {
  pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
};

const KEYS = Object.keys(EMPTY) as (keyof StatLine)[];

export function sumStatLines(rows: Partial<StatLine>[]): StatLine {
  const out = { ...EMPTY };
  for (const r of rows) for (const k of KEYS) out[k] += r[k] ?? 0;
  return out;
}

/** Les points ne sont pas stockés au niveau équipe : ils se déduisent, comme partout ailleurs. */
const points = (l: Pick<StatLine, 'fg2m' | 'fg3m' | 'ftm'>) => 2 * l.fg2m + 3 * l.fg3m + l.ftm;

/** Le total d'équipe d'un camp, remis à plat dans la même forme qu'une ligne individuelle. */
export function teamStatLine(team: TeamMatchStat, side: 'us' | 'them'): StatLine {
  const l = side === 'us'
    ? {
        fg2m: team.fg2m, fg2a: team.fg2a, fg3m: team.fg3m, fg3a: team.fg3a,
        ftm: team.ftm, fta: team.fta, ro: team.ro, rd: team.rd,
        pd: team.pd, ct: team.ct, intercepts: team.intercepts, bp: team.bp,
        fte: team.fte, fpr: team.fpr,
      }
    : {
        fg2m: team.opp_fg2m, fg2a: team.opp_fg2a, fg3m: team.opp_fg3m, fg3a: team.opp_fg3a,
        ftm: team.opp_ftm, fta: team.opp_fta, ro: team.opp_ro, rd: team.opp_rd,
        pd: team.opp_pd, ct: team.opp_ct, intercepts: team.opp_intercepts, bp: team.opp_bp,
        fte: team.opp_fte, fpr: team.opp_fpr,
      };
  return { ...l, pts: points(l) };
}

/**
 * Ce que le total d'équipe compte EN PLUS des lignes individuelles. `null` quand il n'y a rien à
 * montrer — cas normal d'un match saisi joueur par joueur.
 *
 * L'écart est borné à zéro colonne par colonne : un total d'équipe INFÉRIEUR à la somme des
 * individuelles est une incohérence de saisie (deux imports mélangés, une feuille corrigée à la
 * main), et l'afficher en négatif ferait passer un problème de données pour une action de jeu.
 */
export function unattributedLine(
  team: TeamMatchStat,
  individual: Partial<StatLine>[],
  side: 'us' | 'them',
): StatLine | null {
  const total = teamStatLine(team, side);
  const sum = sumStatLines(individual);
  const diff = { ...EMPTY };
  let any = false;
  for (const k of KEYS) {
    diff[k] = Math.max(0, total[k] - sum[k]);
    if (diff[k] > 0) any = true;
  }
  return any ? diff : null;
}
