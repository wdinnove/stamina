import { CURRENT_DATE } from './config';

// ─── Stat computations ────────────────────────────────────────────────────────

/** Pourcentage de réussite au tir (0-100, arrondi) ; null si aucune tentative — seule
 *  implémentation à utiliser pour fg2/fg3/lf, partout dans l'app (évite les 3-4 copies
 *  légèrement différentes qui traînaient dans PlayersPage/MatchDetailPage/crossAnalysis). */
export function shotPct(made: number, att: number): number | null {
  return att > 0 ? Math.round(made / att * 100) : null;
}

// ─── Stat color helpers ───────────────────────────────────────────────────────
type EvalT  = { evalTOrange?: number; evalTBlue?: number; evalTGreen?: number };
type OrtgT  = { ortgTAmber?: number; ortgTGreen?: number };
type DrtgT  = { drtgTAmber?: number; drtgTRed?: number };

export const evalColor = (v: number | null, t?: EvalT): string => {
  if (v === null) return '#475569';
  if (v < (t?.evalTOrange ?? 0))  return '#EF4444';
  if (v < (t?.evalTBlue   ?? 5))  return '#F59E0B';
  if (v < (t?.evalTGreen  ?? 10)) return '#3B82F6';
  return '#00E5A0';
};

export const ortgColor = (v: number, t?: OrtgT): string => {
  if (v > (t?.ortgTGreen ?? 90))  return '#00E5A0';
  if (v >= (t?.ortgTAmber ?? 60)) return '#F59E0B';
  return '#EF4444';
};

export const drtgColor = (v: number, t?: DrtgT): string => {
  if (v < (t?.drtgTAmber ?? 100)) return '#00E5A0';
  if (v < (t?.drtgTRed   ?? 115)) return '#F59E0B';
  return '#EF4444';
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getAge(birthDate: string, refDate = CURRENT_DATE): number {
  const today = new Date(refDate);
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}
