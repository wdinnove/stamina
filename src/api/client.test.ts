import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
const { fetchAllRows, fetchAllByIds, ROW_PAGE, ID_CHUNK } = await import('./client');

/** Faux serveur : `total` lignes, plafonnées à 1000 par réponse comme PostgREST. */
const server = (total: number) => (from: number, to: number) =>
  Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, total - 1, from + 999) - from + 1) }, (_, i) => from + i), error: null });

describe('fetchAllRows', () => {
  it('lit toutes les pages, au-delà du plafond serveur', async () => {
    expect(await fetchAllRows(server(2345))).toHaveLength(2345);
  });
  it('s\'arrête sur une page pleine suivie d\'une page vide', async () => {
    expect(await fetchAllRows(server(ROW_PAGE * 2))).toHaveLength(ROW_PAGE * 2);
    expect(await fetchAllRows(server(0))).toEqual([]);
  });
  it('remonte l\'erreur', async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});

describe('fetchAllByIds', () => {
  it('découpe les ids en paquets, sans doublon', async () => {
    const ids = Array.from({ length: ID_CHUNK * 2 + 5 }, (_, i) => `id${i}`);
    const seen: number[] = [];
    await fetchAllByIds([...ids, 'id0'], (chunk, from, to) => { seen.push(chunk.length); return server(0)(from, to); });
    expect(seen).toEqual([ID_CHUNK, ID_CHUNK, 5]);
  });
  it('ne requête rien sans id', async () => {
    const page = vi.fn();
    expect(await fetchAllByIds([], page)).toEqual([]);
    expect(page).not.toHaveBeenCalled();
  });
});
