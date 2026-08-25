/**
 * Composition d'un rapport : de la sélection de l'utilisateur aux pages du document.
 *
 * Deux étapes distinctes, et c'est volontaire :
 *
 * 1. `composeGroups` regroupe par SUJET. Un rapport se lit sujet par sujet — le bilan collectif,
 *    puis chaque joueur avec toutes ses sections à la suite. Éclater un joueur en cinq endroits du
 *    document obligerait le lecteur à le rassembler lui-même.
 * 2. `paginateGroups` répartit ces blocs sur des pages A4 en fonction de leur hauteur RÉELLE,
 *    mesurée par l'appelant. Une section courte n'occupe donc plus une page entière : elle
 *    s'enchaîne sous la précédente. Sans mesure, une section ferait toujours une page, et un
 *    rapport de douze joueurs gaspillerait quarante pages à moitié vides.
 *
 * Deux sujets ne partagent jamais une page : le bilan d'équipe et le bloc d'un joueur côte à côte
 * sur la même feuille se liraient comme un seul propos.
 */

/** Le périmètre d'une section : le bilan collectif, et/ou les joueurs à détailler. */
export interface ReportScope {
  team: boolean;
  players: string[];
}

/** Une section vue sous un périmètre — l'unité insécable de la mise en page. */
export interface ReportBlock<S extends string> {
  id: string;
  section: S;
  label: string;
  /** "02.3" : troisième section du deuxième sujet. */
  index: string;
}

/** Un sujet du rapport et tout ce que le document en dit. */
export interface ReportGroup<S extends string, P extends { id: string }> {
  id: string;
  /** « Équipe » ou le nom du joueur. */
  subject: string;
  /** Absent = le bilan collectif. */
  player?: P;
  /** "02" */
  index: string;
  blocks: ReportBlock<S>[];
}

/** Une page du document : des blocs d'un seul et même sujet. */
export interface ReportPageSpec<S extends string, P extends { id: string }> {
  id: string;
  groupId: string;
  subject: string;
  player?: P;
  blocks: ReportBlock<S>[];
}

/**
 * @param sections Les sections proposées, dans l'ordre où elles se suivent chez chaque sujet.
 * @param scopes   Le périmètre retenu pour chacune.
 * @param roster   L'effectif, dans l'ordre où les sujets doivent se suivre — un rapport se relit
 *                 comme une liste d'équipe, pas comme un ordre de clic.
 */
export function composeGroups<S extends string, P extends { id: string }>(
  sections: readonly { key: S; label: string }[],
  scopes: Record<S, ReportScope>,
  roster: P[],
  playerName: (p: P) => string,
): ReportGroup<S, P>[] {
  const groups: ReportGroup<S, P>[] = [];

  const push = (id: string, subject: string, keys: S[], player?: P) => {
    if (keys.length === 0) return;
    const index = String(groups.length + 1).padStart(2, '0');
    groups.push({
      id, subject, player, index,
      blocks: keys.map((key, i) => ({
        id: `${id}-${key}`,
        section: key,
        label: sections.find(s => s.key === key)!.label,
        index: `${index}.${i + 1}`,
      })),
    });
  };

  push('team', 'Équipe', sections.filter(s => scopes[s.key]?.team).map(s => s.key));
  for (const player of roster) {
    push(
      player.id,
      playerName(player),
      sections.filter(s => scopes[s.key]?.players.includes(player.id)).map(s => s.key),
      player,
    );
  }

  return groups;
}

export interface PaginateOptions {
  /** Hauteur utile d'une page, bandeau de rappel et pied de page déduits. */
  available: number;
  /** Hauteur mesurée de chaque bloc, par identifiant. Un bloc non mesuré prend une page entière. */
  heights: Record<string, number>;
  /** Espace inséré entre deux blocs enchaînés sur une même page. */
  gap: number;
  /** Hauteur du bandeau d'identité, présent sur chaque page d'un sujet joueur. */
  stripHeight: number;
}

export function paginateGroups<S extends string, P extends { id: string }>(
  groups: ReportGroup<S, P>[],
  { available, heights, gap, stripHeight }: PaginateOptions,
): ReportPageSpec<S, P>[] {
  const pages: ReportPageSpec<S, P>[] = [];

  for (const group of groups) {
    const room = available - (group.player ? stripHeight : 0);
    let current: ReportPageSpec<S, P> | null = null;
    let used = 0;

    for (const block of group.blocks) {
      // Bloc non encore mesuré : on le suppose pleine page, quitte à recomposer au rendu suivant.
      const height = heights[block.id] ?? room;
      const needed = current === null || current.blocks.length === 0 ? height : height + gap;

      if (current === null || (current.blocks.length > 0 && used + needed > room)) {
        current = {
          id: `${group.id}-p${pages.length}`,
          groupId: group.id, subject: group.subject, player: group.player, blocks: [],
        };
        pages.push(current);
        used = height;
      } else {
        used += needed;
      }
      current.blocks.push(block);
    }
  }

  return pages;
}

/** « Charge · Bien-être · Médical » — ce que le sommaire annonce pour un sujet. */
export function groupScopeLabel<S extends string, P extends { id: string }>(group: ReportGroup<S, P>): string {
  return group.blocks.map(b => b.label).join(' · ');
}
