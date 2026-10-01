import { combosAcrossMatches, type EventLineupRow } from './matchEvents';

/**
 * Affinités entre joueurs, tirées des cinq relevés en direct.
 *
 * Un seul chiffre par duo, le même que l'onglet Lineups (Duos · Pour 100 poss.) : l'écart pour
 * 100 possessions pendant que les deux joueurs sont ensemble sur le terrain. Pas de correction
 * cachée — un même duo affiche la même valeur sur les deux pages.
 *
 * La prudence sur les petits échantillons est VISUELLE (pointillés, cases estompées, listes
 * réservées aux duos assez joués, cf. `RELIABLE_SECONDS`) plutôt qu'appliquée aux chiffres.
 */

export interface ChemistryNode {
  id: string;
  /** Temps sur le terrain, en secondes. */
  seconds: number;
  possessions: number;
  /** Écart pour 100 possessions sur le terrain — null sans possession mesurée des deux côtés. */
  net: number | null;
  /** `net` moins celui de l'équipe sur la même période : sur une saison gagnante, tous les joueurs
   *  sont positifs en absolu, et seule cette différence dit qui tire l'équipe vers le haut. */
  vsTeam: number | null;
}

export interface ChemistryLink {
  /** Ids triés : `a` < `b`. */
  a: string;
  b: string;
  /** Temps passé ensemble sur le terrain, en secondes. */
  seconds: number;
  /** Possessions jouées ensemble, comptées comme la colonne « Poss. » de l'onglet Lineups. */
  possessions: number;
  /** Écart pour 100 possessions du duo — la valeur affichée, identique à l'onglet Lineups. */
  duoNet: number | null;
  /** `duoNet` moins celui de l'équipe : sert seulement à placer les joueurs sur la carte. */
  vsTeam: number | null;
}

const net100 = (r: EventLineupRow): number | null =>
  r.pointsPerPossession === null || r.oppPointsPerPossession === null
    ? null
    : (r.pointsPerPossession - r.oppPointsPerPossession) * 100;

/** Joueurs et duos cumulés sur plusieurs matchs (une liste de cinq par match). */
export function chemistryFromMatches(perMatch: EventLineupRow[][]): { nodes: ChemistryNode[]; links: ChemistryLink[]; teamNet: number | null } {
  // L'équipe = la somme de tous ses cinq.
  const all = perMatch.flat();
  const sum = (f: (r: EventLineupRow) => number) => all.reduce((s, r) => s + f(r), 0);
  const [poss, oppPoss] = [sum(r => r.possessions), sum(r => r.oppPossessions)];
  const teamNet = poss > 0 && oppPoss > 0
    ? (sum(r => r.pointsFor) / poss - sum(r => r.pointsAgainst) / oppPoss) * 100
    : null;

  const nodes: ChemistryNode[] = combosAcrossMatches(perMatch, 1).map(r => {
    const net = net100(r);
    return {
      id: r.players[0], seconds: r.seconds, possessions: r.possessions, net,
      vsTeam: net === null || teamNet === null ? null : net - teamNet,
    };
  });

  const links: ChemistryLink[] = combosAcrossMatches(perMatch, 2).map(r => {
    const [a, b] = r.players;
    const duoNet = net100(r);
    return {
      a, b, seconds: r.seconds, possessions: r.possessions, duoNet,
      vsTeam: duoNet === null || teamNet === null ? null : duoNet - teamNet,
    };
  });

  return { nodes, links, teamNet };
}

/** Écart à l'équipe (pts/100) auquel deux joueurs sont collés au plus près, ou écartés au plus loin. */
const DISTANCE_SCALE = 25;
const NEUTRAL_DISTANCE = 1;

/**
 * Place les joueurs sur un plan : proches quand leur duo fait mieux que l'équipe, loin quand il fait
 * moins bien. Une carte à plat ne peut pas respecter toutes les distances à la fois : c'est le
 * meilleur compromis (descente de gradient sur l'écart aux distances visées), pondéré par le temps
 * joué ensemble — un duo de 40 minutes pèse plus qu'un duo de 10.
 *
 * Un duo sous `minSeconds`, ou sans écart mesurable, vise la distance neutre avec un poids
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
      if (l && l.vsTeam !== null && l.seconds >= minSeconds) {
        const s = Math.max(-1, Math.min(1, l.vsTeam / DISTANCE_SCALE));
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
