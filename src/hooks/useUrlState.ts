import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Un état d'écran porté par l'URL plutôt que par `useState` : recherche, filtre, tri, dossier
 * ouvert…
 *
 * Même parti pris que `equipe`/`saison` (cf. TeamSeasonContext) : ce qui décrit CE QU'ON REGARDE
 * appartient à l'adresse. Un filtre gardé en état local ne se partage pas, ne se met pas en
 * favori, disparaît au rafraîchissement, et rend le bouton Précédent faux — il quitte la page
 * entière alors qu'on n'a fait que filtrer.
 *
 * Deux règles pour que l'adresse reste lisible et l'historique utilisable :
 *  • une valeur par défaut n'est PAS écrite — `?statut=all` n'apprend rien, et une URL nue reste
 *    l'état neutre de la page ;
 *  • un changement de filtre REMPLACE l'entrée d'historique au lieu d'en empiler une. Sans ça,
 *    taper « pivot » dans une recherche demanderait cinq clics sur Précédent pour en sortir.
 *    `push` inverse ce choix pour ce qui relève vraiment d'une navigation (entrer dans un
 *    dossier), où Précédent doit remonter d'un niveau — au réglage du hook, ou au coup par coup
 *    sur un appel précis.
 *
 * `allowed`, quand il est fourni, ramène une valeur inconnue au défaut : une URL bricolée à la
 * main ou devenue périmée affiche la page neutre, jamais une liste vide inexplicable.
 */
export function useUrlState<T extends string = string>(
  key: string,
  // `NoInfer` : le type vient de `allowed` (ou du paramètre explicite), jamais du littéral passé
  // en défaut — sans quoi `useUrlState('statut', 'all')` figerait le type sur « all ».
  defaultValue: NoInfer<T>,
  options?: { push?: boolean; allowed?: readonly T[] },
): [T, (next: T, callOptions?: { push?: boolean }) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const push    = options?.push ?? false;
  const allowed = options?.allowed;

  const raw = searchParams.get(key) as T | null;
  const value = raw === null || (allowed && !allowed.includes(raw)) ? defaultValue : raw;

  const setValue = useCallback((next: T, callOptions?: { push?: boolean }) => {
    setSearchParams(prev => {
      // Recopie des paramètres existants : `equipe` et `saison` voyagent avec, sinon le contexte
      // les réécrirait juste après et l'adresse clignoterait.
      const params = new URLSearchParams(prev);
      if (next === defaultValue || next === '') params.delete(key);
      else params.set(key, next);
      return params;
    }, { replace: !(callOptions?.push ?? push) });
  }, [key, defaultValue, push, setSearchParams]);

  return [value, setValue];
}

/**
 * Écrit PLUSIEURS paramètres en une seule navigation.
 *
 * Indispensable dès qu'un geste touche deux filtres à la fois — « effacer les filtres », un tri
 * qui change de colonne et de sens. `setSearchParams` résout la forme fonctionnelle sur les
 * paramètres du rendu COURANT : deux appels dans le même gestionnaire partent du même état et le
 * second écrase le premier. Un seul appel, un seul patch.
 *
 * `defaults` sert à garder l'adresse propre : une valeur égale au défaut est retirée plutôt
 * qu'écrite, exactement comme dans `useUrlState`.
 */
export function useUrlPatch(defaults: Record<string, string> = {}) {
  const [, setSearchParams] = useSearchParams();
  return useCallback((patch: Record<string, string | null>, options?: { push?: boolean }) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || value === defaults[key]) params.delete(key);
        else params.set(key, value);
      }
      return params;
    }, { replace: !(options?.push ?? false) });
    // `defaults` est un littéral reconstruit à chaque rendu : le sérialiser évite de recréer le
    // patcher sans raison, sans imposer un useMemo à chaque appelant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearchParams, JSON.stringify(defaults)]);
}

export type SortDir = 'asc' | 'desc';
const SORT_DIRS = ['asc', 'desc'] as const;

/**
 * Tri d'un tableau porté par l'URL : `?tri=<colonne>&sens=asc|desc`.
 *
 * Regroupe le geste que chaque tableau réécrivait à l'identique — reclic sur la colonne active =
 * on inverse le sens, clic sur une autre = on change de colonne avec son sens naturel (croissant
 * pour un nom, décroissant pour un chiffre, d'où `dirFor`). Colonne et sens partent en UN patch :
 * deux écritures séparées de l'URL et la seconde écraserait la première (cf. useUrlPatch).
 *
 * `ns` distingue plusieurs tableaux triables sur une MÊME adresse — la feuille de match affiche
 * le tableau de l'équipe et celui de l'adversaire côte à côte. Sans lui, trier l'un trierait
 * l'autre. Les paramètres deviennent `tri_<ns>` / `sens_<ns>`.
 */
export function useUrlSort<K extends string>(
  defaults: { key: K; dir: SortDir },
  options?: { ns?: string; allowed?: readonly K[]; dirFor?: (key: K) => SortDir },
): { sortKey: K; sortDir: SortDir; toggleSort: (key: K) => void } {
  const suffix   = options?.ns ? `_${options.ns}` : '';
  const keyParam = `tri${suffix}`;
  const dirParam = `sens${suffix}`;

  const [sortKey] = useUrlState<K>(keyParam, defaults.key, { allowed: options?.allowed });
  const [sortDir] = useUrlState<SortDir>(dirParam, defaults.dir, { allowed: SORT_DIRS });
  const patch = useUrlPatch({ [keyParam]: defaults.key, [dirParam]: defaults.dir });

  const toggleSort = (key: K) => {
    patch(key === sortKey
      ? { [dirParam]: sortDir === 'asc' ? 'desc' : 'asc' }
      : { [keyParam]: key, [dirParam]: options?.dirFor?.(key) ?? defaults.dir });
  };

  return { sortKey, sortDir, toggleSort };
}
