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

/** Une mesure réelle, sans correction : temps, possessions, +/- /100. */
export interface SplitPart {
  seconds: number;
  possessions: number;
  /** +/- /100 — null sans possession mesurée des deux côtés. */
  net: number | null;
}

/** Un duo vu sous trois angles : les deux ensemble, et chacun quand l'autre est sur le banc. */
export interface PairSplit {
  together: SplitPart;
  aWithout: SplitPart;
  bWithout: SplitPart;
}

/**
 * « Ensemble / A sans B / B sans A », sur les cinq de plusieurs matchs. Trois chiffres réels dans
 * la même unité que le reste : répondre à « les fait-on jouer ensemble ? » sans métrique dérivée.
 */
export function pairSplit(perMatch: EventLineupRow[][], a: string, b: string): PairSplit {
  const acc = () => ({ seconds: 0, possessions: 0, oppPossessions: 0, pointsFor: 0, pointsAgainst: 0 });
  const parts = { together: acc(), aWithout: acc(), bWithout: acc() };
  for (const r of perMatch.flat()) {
    const hasA = r.players.includes(a), hasB = r.players.includes(b);
    const t = hasA && hasB ? parts.together : hasA ? parts.aWithout : hasB ? parts.bWithout : null;
    if (!t) continue;
    t.seconds += r.seconds;
    t.possessions += r.possessions;
    t.oppPossessions += r.oppPossessions;
    t.pointsFor += r.pointsFor;
    t.pointsAgainst += r.pointsAgainst;
  }
  const done = (p: ReturnType<typeof acc>): SplitPart => ({
    seconds: p.seconds,
    possessions: p.possessions,
    net: p.possessions > 0 && p.oppPossessions > 0
      ? (p.pointsFor / p.possessions - p.pointsAgainst / p.oppPossessions) * 100
      : null,
  });
  return { together: done(parts.together), aWithout: done(parts.aWithout), bWithout: done(parts.bWithout) };
}

export type PairVerdictKind = 'together' | 'apart' | 'aAlone' | 'bAlone' | 'even' | 'unsure';

/** Écart (pts/100) en deçà duquel deux chiffres sont considérés comme équivalents. */
const VERDICT_MARGIN = 5;

/**
 * La conclusion en une phrase, pour un coach qui ne lit pas de statistiques. Prudente par
 * construction : sous `minSeconds` dans l'une des trois situations, elle refuse de conclure.
 */
export function pairVerdict(split: PairSplit, nameA: string, nameB: string, minSeconds: number): { kind: PairVerdictKind; text: string } {
  const { together: t, aWithout: a, bWithout: b } = split;
  if (t.net === null || a.net === null || b.net === null
    || t.seconds < minSeconds || a.seconds < minSeconds || b.seconds < minSeconds) {
    return { kind: 'unsure', text: 'Pas assez de minutes pour conclure : il faut les voir jouer ensemble, et chacun sans l\'autre.' };
  }
  if (t.net >= Math.max(a.net, b.net) + VERDICT_MARGIN) {
    return { kind: 'together', text: `${nameA} et ${nameB} font mieux ensemble que séparément : à faire jouer ensemble.` };
  }
  if (t.net <= Math.min(a.net, b.net) - VERDICT_MARGIN) {
    return { kind: 'apart', text: `${nameA} et ${nameB} font moins bien ensemble que séparément : plutôt à séparer.` };
  }
  if (a.net >= t.net + VERDICT_MARGIN) return { kind: 'aAlone', text: `${nameA} fait mieux sans ${nameB} : association à surveiller.` };
  if (b.net >= t.net + VERDICT_MARGIN) return { kind: 'bAlone', text: `${nameB} fait mieux sans ${nameA} : association à surveiller.` };
  return { kind: 'even', text: `Ensemble ou séparément, pas de différence nette pour ${nameA} et ${nameB}.` };
}

const signedRound = (v: number) => { const r = Math.round(v); return `${r > 0 ? '+' : ''}${r}`; };
const minutes = (s: number) => `${Math.round(s / 60)} min`;

/** Écart à l'équipe (pts/100) en deçà duquel un joueur est « dans la moyenne ». */
const TEAM_MARGIN = 3;

/**
 * Bilan d'un joueur en quelques phrases, pour un coach qui ne lit pas de statistiques. Uniquement
 * des chiffres réels déjà visibles à l'écran (+/- /100, minutes) et les verdicts de `pairVerdict` ;
 * un partenaire n'est cité que s'il a joué au moins `reliableSeconds` avec lui.
 */
export function playerReport(
  node: ChemistryNode,
  teamNet: number | null,
  links: ChemistryLink[],
  perMatch: EventLineupRow[][],
  nameOf: (id: string) => string,
  reliableSeconds: number,
): string[] {
  const me = nameOf(node.id);
  const lines: string[] = [];

  if (node.net === null) return [`${me} : pas encore de possession mesurée.`];
  let level = `L'équipe est à ${signedRound(node.net)} /100 quand ${me} est sur le terrain (${minutes(node.seconds)})`;
  if (teamNet !== null) {
    const d = node.net - teamNet;
    level += Math.abs(d) < TEAM_MARGIN
      ? `, dans la moyenne de l'équipe (${signedRound(teamNet)}).`
      : d > 0 ? `, mieux que la moyenne de l'équipe (${signedRound(teamNet)}).`
        : `, moins bien que la moyenne de l'équipe (${signedRound(teamNet)}).`;
  } else level += '.';
  lines.push(level);

  const mine = links
    .filter(l => (l.a === node.id || l.b === node.id) && l.duoNet !== null && l.seconds >= reliableSeconds)
    .map(l => ({ partner: l.a === node.id ? l.b : l.a, link: l }))
    .sort((x, y) => y.link.duoNet! - x.link.duoNet!);
  if (mine.length === 0) {
    lines.push(`Pas encore assez de minutes avec un même partenaire (${minutes(reliableSeconds)}) pour parler de duos.`);
    return lines;
  }

  const best = mine[0], worst = mine[mine.length - 1];
  lines.push(`Meilleur duo : avec ${nameOf(best.partner)}, ${signedRound(best.link.duoNet!)} /100 en ${minutes(best.link.seconds)}.`);
  if (worst !== best) {
    lines.push(`Duo le plus difficile : avec ${nameOf(worst.partner)}, ${signedRound(worst.link.duoNet!)} /100 en ${minutes(worst.link.seconds)}.`);
  }

  // Ensemble / séparément : seulement les conclusions nettes, pas les « pas de différence ».
  const together: string[] = [], apart: string[] = [];
  for (const { partner } of mine) {
    const v = pairVerdict(pairSplit(perMatch, node.id, partner), me, nameOf(partner), reliableSeconds).kind;
    if (v === 'together') together.push(nameOf(partner));
    if (v === 'apart') apart.push(nameOf(partner));
  }
  if (together.length) lines.push(`Fait mieux avec que séparément : ${together.join(', ')} — à associer.`);
  if (apart.length) lines.push(`Fait moins bien avec que séparément : ${apart.join(', ')} — plutôt à séparer.`);
  return lines;
}
