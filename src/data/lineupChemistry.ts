import { combosAcrossMatches, type EventLineupRow } from './matchEvents';

/**
 * Affinités entre joueurs, tirées des cinq relevés en direct.
 *
 * Deux lectures distinctes :
 *   - l'APPORT d'un joueur : l'écart pour 100 possessions quand il est sur le terrain ;
 *   - la SYNERGIE d'un duo : ce que le duo fait DE PLUS que ce qu'on attendait de ses deux joueurs
 *     (la moyenne de leurs apports). Sans ce retrait, le meilleur joueur de l'équipe aurait un bon
 *     duo avec tout le monde — grâce à lui, pas grâce à l'association.
 */

export interface ChemistryNode {
  id: string;
  /** Temps sur le terrain, en secondes. */
  seconds: number;
  possessions: number;
  /** Écart pour 100 possessions sur le terrain — null sans possession mesurée des deux côtés. */
  net: number | null;
}

export interface ChemistryLink {
  /** Ids triés : `a` < `b`. */
  a: string;
  b: string;
  /** Temps passé ensemble sur le terrain, en secondes. */
  seconds: number;
  /** Écart pour 100 possessions du duo. */
  duoNet: number | null;
  /** Ce qu'on attendait du duo : la moyenne des apports des deux joueurs. */
  expected: number | null;
  /** `duoNet − expected` : positif, le duo fait mieux que ses deux joueurs ; négatif, moins bien. */
  synergy: number | null;
}

const net100 = (r: EventLineupRow): number | null =>
  r.pointsPerPossession === null || r.oppPointsPerPossession === null
    ? null
    : (r.pointsPerPossession - r.oppPointsPerPossession) * 100;

/** Joueurs et duos cumulés sur plusieurs matchs (une liste de cinq par match). */
export function chemistryFromMatches(perMatch: EventLineupRow[][]): { nodes: ChemistryNode[]; links: ChemistryLink[] } {
  const nodes: ChemistryNode[] = combosAcrossMatches(perMatch, 1).map(r => ({
    id: r.players[0], seconds: r.seconds, possessions: r.possessions, net: net100(r),
  }));
  const netById = new Map(nodes.map(n => [n.id, n.net]));

  const links: ChemistryLink[] = combosAcrossMatches(perMatch, 2).map(r => {
    const [a, b] = r.players;
    const na = netById.get(a) ?? null;
    const nb = netById.get(b) ?? null;
    const duoNet = net100(r);
    const expected = na === null || nb === null ? null : (na + nb) / 2;
    return {
      a, b, seconds: r.seconds, duoNet, expected,
      synergy: duoNet === null || expected === null ? null : duoNet - expected,
    };
  });

  return { nodes, links };
}

/** Synergie (pts/100) à laquelle deux joueurs sont collés au plus près, ou écartés au plus loin. */
const SYNERGY_SCALE = 30;
const NEUTRAL_DISTANCE = 1;

/**
 * Place les joueurs sur un plan : proches quand leur duo a une bonne synergie, loin quand il en a
 * une mauvaise. Une carte à plat ne peut pas respecter toutes les distances à la fois : c'est le
 * meilleur compromis (descente de gradient sur l'écart aux distances visées), pondéré par le temps
 * joué ensemble — un duo de 40 minutes pèse plus qu'un duo de 10.
 *
 * Un duo sous `minSeconds`, ou sans synergie mesurable, vise la distance neutre avec un poids
 * minime : il ne tire la carte dans aucun sens, il évite seulement que les points se superposent.
 *
 * Déterministe (départ sur un cercle, dans l'ordre reçu) : la même saison donne toujours la même
 * carte, sans quoi le coach verrait les joueurs changer de place à chaque visite.
 *
 * ponytail: O(itérations × n²), sans souci jusqu'à ~30 joueurs ; au-delà, un vrai MDS.
 */
export function layoutChemistry(
  ids: string[],
  links: ChemistryLink[],
  minSeconds: number,
): Map<string, { x: number; y: number }> {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const pos = ids.map((_, i) => ({
    x: Math.cos((2 * Math.PI * i) / Math.max(n, 1)),
    y: Math.sin((2 * Math.PI * i) / Math.max(n, 1)),
  }));

  // Distances visées et poids, pour chaque paire.
  const target: { i: number; j: number; d: number; w: number }[] = [];
  const linkByPair = new Map(links.map(l => [`${l.a}|${l.b}`, l]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [a, b] = [ids[i], ids[j]].sort();
      const l = linkByPair.get(`${a}|${b}`);
      if (l && l.synergy !== null && l.seconds >= minSeconds) {
        const s = Math.max(-1, Math.min(1, l.synergy / SYNERGY_SCALE));
        target.push({ i, j, d: NEUTRAL_DISTANCE * (1 - 0.7 * s), w: Math.min(1, l.seconds / (minSeconds * 3 || 1)) });
      } else {
        target.push({ i, j, d: NEUTRAL_DISTANCE * 1.2, w: 0.05 });
      }
    }
  }

  const ITERATIONS = 400;
  for (let it = 0; it < ITERATIONS; it++) {
    const step = 0.2 * (1 - it / ITERATIONS) + 0.01;
    const grad = pos.map(() => ({ x: 0, y: 0 }));
    for (const { i, j, d, w } of target) {
      const dx = pos[i].x - pos[j].x;
      const dy = pos[i].y - pos[j].y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const g = (w * (dist - d)) / dist;
      grad[i].x += g * dx; grad[i].y += g * dy;
      grad[j].x -= g * dx; grad[j].y -= g * dy;
    }
    pos.forEach((p, k) => { p.x -= step * grad[k].x; p.y -= step * grad[k].y; });
  }

  return new Map(ids.map(id => [id, pos[index.get(id)!]]));
}
