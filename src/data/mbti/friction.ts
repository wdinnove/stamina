import { MBTI_AXES } from './questions';
import type { MbtiAxisDef, MbtiPole, MbtiResult } from './types';

/**
 * Pistes de friction entre profils — lecture indicative, pas un verdict.
 *
 * Deux joueuses ne « s'opposent » sur un axe que si elles penchent chacune d'un côté ET que l'écart
 * entre leurs positions est net : deux profils proches du milieu portent des lettres différentes
 * sans que ça change quoi que ce soit au quotidien. D'où le seuil ci-dessous, exprimé en points de
 * pourcentage sur l'axe (0–100), qui est le seul paramètre du calcul.
 */
export const FRICTION_MIN_GAP = 25;

/** Au-delà de cette intensité cumulée, la paire est mise en avant dans l'app. */
export const FRICTION_ALERT_SCORE = 60;

export interface MbtiPlayerResult {
  playerId: string;
  result: MbtiResult;
}

export interface AxisOpposition {
  key: MbtiAxisDef['key'];
  label: string;
  /** Pôle de chacune des deux joueuses sur cet axe. */
  poleA: MbtiPole;
  poleB: MbtiPole;
  /** Écart en points de pourcentage entre leurs positions sur l'axe. */
  gap: number;
  /** Conduite à tenir quand ces deux pôles se croisent. */
  advice: string;
}

export interface MbtiPair {
  playerIdA: string;
  playerIdB: string;
  /** Somme des écarts sur les axes réellement opposés (0 = aucune opposition marquée). */
  frictionScore: number;
  oppositions: AxisOpposition[];
  /** Axes où les deux joueuses penchent du même côté. */
  sharedPoles: MbtiPole[];
}

export interface AxisSpread {
  key: MbtiAxisDef['key'];
  label: string;
  a: MbtiPole;
  b: MbtiPole;
  /** Nombre de joueuses de chaque côté ; `tied` = celles à égalité stricte sur cet axe. */
  countA: number;
  countB: number;
  tied: number;
  /** Part du pôle a parmi les joueuses tranchées, en pourcentage entier (null si aucune). */
  percentA: number | null;
}

/** Ce que produit concrètement une opposition d'axe dans un groupe, et quoi en faire. */
const AXIS_ADVICE: Record<MbtiAxisDef['key'], string> = {
  EI: "L'une pense en parlant, l'autre a besoin de temps seule avant de répondre. Ne pas lire le silence comme un désaccord, ni le flot de paroles comme une décision prise.",
  SN: "L'une veut des faits et des exemples concrets, l'autre raisonne en possibilités. Poser les deux : le principe général, puis ce que ça change au prochain entraînement.",
  TF: "L'une tranche sur la logique, l'autre sur l'impact humain. Un feedback direct peut être reçu comme une attaque d'un côté, un ménagement comme un flou de l'autre.",
  JP: "L'une a besoin d'un cadre décidé à l'avance, l'autre de garder des options ouvertes. C'est la friction la plus visible au quotidien : annoncer tôt ce qui est figé, et dire explicitement ce qui reste souple.",
};

/** Répartition de l'effectif sur chaque axe. Les égalités sont comptées à part, jamais reversées. */
export function axisSpread(players: MbtiPlayerResult[]): AxisSpread[] {
  return MBTI_AXES.map(axis => {
    let countA = 0, countB = 0, tied = 0;
    for (const p of players) {
      const ax = p.result.axes.find(x => x.key === axis.key);
      if (!ax || ax.winner === null) { tied++; continue; }
      if (ax.winner === axis.a) countA++; else countB++;
    }
    const decided = countA + countB;
    return {
      key: axis.key, label: axis.label, a: axis.a, b: axis.b,
      countA, countB, tied,
      percentA: decided ? Math.round((countA / decided) * 100) : null,
    };
  });
}

/** Toutes les paires de l'effectif, décrites axe par axe et triées par friction décroissante. */
export function teamPairs(players: MbtiPlayerResult[]): MbtiPair[] {
  const pairs: MbtiPair[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const pa = players[i], pb = players[j];
      const oppositions: AxisOpposition[] = [];
      const sharedPoles: MbtiPole[] = [];

      for (const axis of MBTI_AXES) {
        const axA = pa.result.axes.find(x => x.key === axis.key);
        const axB = pb.result.axes.find(x => x.key === axis.key);
        if (!axA || !axB) continue;
        // Une joueuse à égalité sur l'axe ne s'oppose à personne : elle est au milieu.
        if (axA.winner === null || axB.winner === null) continue;

        if (axA.winner === axB.winner) { sharedPoles.push(axA.winner); continue; }

        const gap = Math.abs(axA.percentA - axB.percentA);
        if (gap < FRICTION_MIN_GAP) continue;   // lettres différentes mais positions voisines

        oppositions.push({
          key: axis.key, label: axis.label,
          poleA: axA.winner, poleB: axB.winner,
          gap, advice: AXIS_ADVICE[axis.key],
        });
      }

      pairs.push({
        playerIdA: pa.playerId,
        playerIdB: pb.playerId,
        frictionScore: oppositions.reduce((s, o) => s + o.gap, 0),
        oppositions,
        sharedPoles,
      });
    }
  }

  return pairs.sort((x, y) => y.frictionScore - x.frictionScore);
}

/** Les paires à regarder en priorité : opposées sur au moins un axe, au-delà du seuil d'alerte. */
export function frictionPairs(players: MbtiPlayerResult[], limit = 5): MbtiPair[] {
  return teamPairs(players).filter(p => p.frictionScore >= FRICTION_ALERT_SCORE).slice(0, limit);
}

/** Les paires les plus alignées : aucune opposition marquée, un maximum de pôles partagés. */
export function affinityPairs(players: MbtiPlayerResult[], limit = 5): MbtiPair[] {
  return teamPairs(players)
    .filter(p => p.oppositions.length === 0)
    .sort((x, y) => y.sharedPoles.length - x.sharedPoles.length)
    .slice(0, limit);
}
