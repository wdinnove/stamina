import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);

/** En-têtes pour les appels aux fonctions serverless (/api/*), qui vérifient le JWT Supabase. */
export async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Ids par `in(...)` : la liste part entière dans l'URL de la requête, et une saison complète de
 *  séances la ferait dépasser la limite des proxies. 100 UUID ≈ 3,7 ko. */
export const ID_CHUNK = 100;

/** Taille d'une page de lignes, sous le plafond serveur (`max-rows`, 1000 chez Supabase) : une page
 *  incomplète veut alors bien dire « dernière page », pas « réponse tronquée ». */
export const ROW_PAGE = 500;

export function chunked<T>(list: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Pas de types générés pour la base : les lignes sont lues en `any` et converties par chaque api.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Page = PromiseLike<{ data: Row[] | null; error: unknown }>;

/**
 * TOUTES les lignes d'une requête, lues page par page. PostgREST plafonne la réponse (`max-rows`)
 * SANS erreur : sans cette boucle, une requête qui grossit avec le temps (RPE, bien-être…) finit
 * par être calculée sur une fraction des données, en silence.
 *
 * `page(from, to)` doit appliquer `.range(from, to)` et trier sur une clé UNIQUE (au besoin `id`
 * en dernier) : sans ordre total, deux pages peuvent se chevaucher ou sauter des lignes.
 */
export async function fetchAllRows(page: (from: number, to: number) => Page): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await page(from, from + ROW_PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < ROW_PAGE) return out;
  }
}

/** `fetchAllRows` sur une liste d'ids découpée en paquets (`chunked`), paquets lus en parallèle. */
export async function fetchAllByIds(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => Page,
): Promise<Row[]> {
  const unique = [...new Set(ids)];
  const parts = await Promise.all(chunked(unique).map(chunk => fetchAllRows((from, to) => page(chunk, from, to))));
  return parts.flat();
}
