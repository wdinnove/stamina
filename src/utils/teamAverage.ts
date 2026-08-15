import { mean, roundedAvg } from './avg';

/**
 * Chiffre d'équipe : la valeur, et le nombre de joueurs qui la composent.
 *
 * `players` n'est pas décoratif — il doit être affiché à côté de la valeur. Une moyenne non
 * pondérée devient nerveuse quand peu de joueurs ont saisi (une seule saisie pèse alors autant
 * que dix), et le seul moyen honnête de rendre le chiffre lisible est de montrer sur combien de
 * joueurs il repose.
 */
export interface TeamAverage {
  value: number | null;
  players: number;
}

export const EMPTY_TEAM_AVERAGE: TeamAverage = { value: null, players: 0 };

/**
 * RÈGLE UNIQUE DE L'APP pour tout chiffre d'équipe (RPE, bien-être, présences) :
 * **moyenne NON PONDÉRÉE des valeurs individuelles**. On agrège d'abord par joueur, puis on
 * moyenne les joueurs — jamais une moyenne à plat des lignes brutes.
 *
 * Pourquoi : une moyenne à plat pondère le résultat par l'assiduité. Deux blessés qui arrêtent
 * de loguer feraient monter le RPE moyen d'équipe sans que personne se soit entraîné plus dur ;
 * des joueurs qui vont mal et saisissent moins feraient monter le score de bien-être. Comme
 * l'assiduité est suivie comme un indicateur à part entière, la laisser pondérer les autres
 * revient à mélanger deux signaux et à en compter un deux fois.
 *
 * `valueOf` reçoit toutes les lignes d'UN joueur et renvoie sa valeur individuelle, ou `null`
 * s'il n'en a pas — il sort alors du calcul ET du décompte `players`.
 *
 * Invariant vérifiable : le résultat est toujours égal à la moyenne non pondérée de la colonne
 * de valeurs individuelles affichée sous le chiffre d'équipe.
 *
 * Contrepartie assumée : le chiffre d'une période ne se recompose PAS exactement en la moyenne
 * des chiffres de ses sous-périodes. Aucune formule ne peut offrir à la fois la réconciliation
 * par joueur et la réconciliation par temps dès que l'assiduité n'est pas uniforme (voir
 * `docs/CALCULS.md`, § « Moyennes d'équipe »).
 */
export function teamAverage<T>(
  rows: T[],
  playerIdOf: (row: T) => string,
  valueOf: (playerRows: T[]) => number | null,
): TeamAverage {
  const byPlayer = new Map<string, T[]>();
  for (const row of rows) {
    const id = playerIdOf(row);
    const list = byPlayer.get(id);
    if (list) list.push(row);
    else byPlayer.set(id, [row]);
  }

  const values: number[] = [];
  for (const playerRows of byPlayer.values()) {
    const v = valueOf(playerRows);
    if (v !== null) values.push(v);
  }

  return { value: roundedAvg(values), players: values.length };
}

/**
 * Cas courant : la valeur d'un joueur est la moyenne d'un champ numérique de ses lignes.
 * La moyenne individuelle n'est volontairement pas arrondie (`mean`, pas `roundedAvg`) — seul
 * le chiffre d'équipe final l'est, pour ne pas cumuler deux arrondis.
 */
export function teamAverageOfField<T>(
  rows: T[],
  playerIdOf: (row: T) => string,
  numberOf: (row: T) => number,
): TeamAverage {
  return teamAverage(rows, playerIdOf, playerRows => mean(playerRows.map(numberOf)));
}
