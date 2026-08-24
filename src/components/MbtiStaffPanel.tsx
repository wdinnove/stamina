import { useMemo, useState } from 'react';
import { Copy, Check, Users, Zap, Sparkles } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Disclaimer } from './MbtiPlayerPanel';
import { MbtiDetailModal } from './MbtiDetailModal';
import { useStaffMbtiResponses } from '../hooks/useMbtiResponses';
import {
  MBTI_PROFILES_V1, safeComputeMbtiResult, tieLabel,
  axisSpread, frictionPairs, affinityPairs, type MbtiPlayerResult, type MbtiResult,
} from '../data/mbti';
import { fmtDate } from '../utils/dateFormat';
import { copyToClipboard, staffMbtiPublicUrl } from '../utils/publicLinks';
import type { StaffMember } from '../data/types';

const ACCENT = '#8B5CF6';

const staffName = (m: StaffMember) => `${m.firstName} ${m.lastName}`;
const staffNameShort = (m: StaffMember) => `${m.firstName[0]}. ${m.lastName}`;

/**
 * Pendant de `MbtiTeamPanel` pour le staff de l'équipe — même questionnaire, même moteur de
 * lecture (répartition, frictions), mais pas d'envoi de lien par email (pas d'infrastructure
 * dédiée côté staff) : juste la table des réponses (avec détail au clic sur le type) et un lien
 * à copier pour les personnes en attente.
 */
export function MbtiStaffPanel({ staff }: { staff: StaffMember[] }) {
  const staffIds = useMemo(() => staff.map(m => m.id), [staff]);
  const { responses, loading } = useStaffMbtiResponses(staffIds);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<{ name: string; result: MbtiResult; submittedAt: string } | null>(null);

  const { answered, pending, results } = useMemo(() => {
    const byStaff = new Map(responses.map(r => [r.staffId, r]));
    const answeredRows: { member: StaffMember; submittedAt: string; result: NonNullable<ReturnType<typeof safeComputeMbtiResult>> }[] = [];
    const pendingRows: StaffMember[] = [];
    for (const member of staff) {
      const response = byStaff.get(member.id);
      const result = safeComputeMbtiResult(response?.answers);
      if (response && result) answeredRows.push({ member, submittedAt: response.submittedAt, result });
      else pendingRows.push(member);
    }
    answeredRows.sort((a, b) => staffNameShort(a.member).localeCompare(staffNameShort(b.member)));
    return {
      answered: answeredRows,
      pending: pendingRows,
      // `MbtiPlayerResult`/`frictionPairs` etc. sont génériques sur un identifiant nommé
      // `playerId` — réutilisés tels quels avec l'id du membre du staff dedans.
      results: answeredRows.map(r => ({ playerId: r.member.id, result: r.result })) as MbtiPlayerResult[],
    };
  }, [staff, responses]);

  const nameOf = useMemo(
    () => new Map(staff.map(m => [m.id, staffNameShort(m)])),
    [staff],
  );

  const spread     = useMemo(() => axisSpread(results), [results]);
  const frictions  = useMemo(() => frictionPairs(results), [results]);
  const affinities = useMemo(() => affinityPairs(results, 3), [results]);

  async function handleCopy(staffId: string) {
    const ok = await copyToClipboard(staffMbtiPublicUrl(staffId));
    if (ok) { setCopiedId(staffId); setTimeout(() => setCopiedId(null), 2000); }
  }

  if (loading) return <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;

  if (!staff.length) {
    return <Card><EmptyState message="Aucun membre du staff sur cette équipe." /></Card>;
  }

  return (
    <div>
      <Disclaimer />

      {/* ── Tableau du staff ──────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', backgroundColor: '#1A1E26', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} color="#94A3B8" />
          <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>
            Profils du staff
          </p>
          <span style={{ color: '#475569', fontSize: '0.7rem' }}>{answered.length} / {staff.length} renseignés</span>
        </div>

        {answered.length === 0 ? (
          <EmptyState message="Personne n'a encore rempli le questionnaire." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#64748B' }}>
                  {['Nom', 'Type', 'Profil', 'Passation'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {answered.map(({ member, result, submittedAt }) => {
                  const profile = MBTI_PROFILES_V1[result.candidates[0]];
                  return (
                    <tr key={member.id}
                      onClick={() => setDetailFor({ name: staffName(member), result, submittedAt })}
                      style={{ borderTop: '1px solid #2A2F3A', cursor: 'pointer' }}>
                      <td style={{ ...td, color: '#F1F5F9', fontWeight: 600 }}>{staffName(member)}</td>
                      <td style={td}>
                        <Badge color={ACCENT} label={result.code} size="sm" />
                        {result.ties.map(t => (
                          <Badge key={t} color="#F59E0B" label={tieLabel(t)} size="sm" style={{ marginLeft: 4 }} />
                        ))}
                      </td>
                      <td style={{ ...td, color: '#CBD5E1' }}>{profile.nick}</td>
                      <td style={{ ...td, color: '#64748B' }}>{fmtDate(submittedAt.slice(0, 10))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Non-répondants ────────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <CardTitle icon={<Users size={14} color="#F59E0B" />} info={`${pending.length} personne${pending.length > 1 ? 's' : ''}`}>
            En attente de réponse
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map(member => (
              <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6 }}>
                <span style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>{staffName(member)}</span>
                <button onClick={() => handleCopy(member.id)} style={btn('#0D0F14', copiedId === member.id ? '#00E5A0' : '#94A3B8')}>
                  {copiedId === member.id ? <Check size={13} /> : <Copy size={13} />}
                  {copiedId === member.id ? 'Copié' : 'Copier le lien'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Répartition du staff ──────────────────────────────────────────── */}
      {answered.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <CardTitle icon={<Sparkles size={14} color={ACCENT} />} info={`sur ${answered.length} profil${answered.length > 1 ? 's' : ''}`}>
            Répartition du staff
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
            {spread.map(ax => (
              <div key={ax.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                  <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{ax.a} · {ax.countA}</span>
                  <span style={{ color: '#475569', fontSize: '0.72rem' }}>
                    {ax.label}{ax.tied > 0 ? ` — ${ax.tied} à égalité` : ''}
                  </span>
                  <span style={{ color: '#CBD5E1', fontWeight: 600 }}>{ax.countB} · {ax.b}</span>
                </div>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#0D0F14' }}>
                  <div style={{ width: `${ax.percentA ?? 50}%`, backgroundColor: ACCENT }} />
                  <div style={{ width: `${100 - (ax.percentA ?? 50)}%`, backgroundColor: '#2A2F3A' }} />
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, margin: '0 0 8px' }}>
            Types présents
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {countTypes(answered).map(([code, count]) => (
              <Badge key={code} color={ACCENT} label={`${code} × ${count}`} size="sm" />
            ))}
          </div>
        </Card>
      )}

      {/* ── Frictions ─────────────────────────────────────────────────────── */}
      {answered.length >= 2 && (
        <Card>
          <CardTitle icon={<Zap size={14} color="#F59E0B" />} info={<Badge color={ACCENT} label="BÊTA" size="sm" />}>
            Pistes de friction
          </CardTitle>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', lineHeight: 1.6, margin: '0 0 14px' }}>
            Deux personnes ne sont signalées que si elles penchent chacune d'un côté d'un axe
            <em> et</em> que l'écart est net — des lettres différentes autour du milieu ne changent rien
            au quotidien. Ce sont des hypothèses de lecture, pas des conflits constatés.
          </p>

          {frictions.length === 0 ? (
            <EmptyState message="Aucune opposition marquée dans le staff renseigné." size="sm" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {frictions.map(pair => (
                <div key={`${pair.playerIdA}-${pair.playerIdB}`} style={{ padding: '10px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6 }}>
                  <p style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 8px' }}>
                    {nameOf.get(pair.playerIdA)} ↔ {nameOf.get(pair.playerIdB)}
                  </p>
                  {pair.oppositions.map(opp => (
                    <div key={opp.key} style={{ marginBottom: 8 }}>
                      <Badge color="#F59E0B" label={`${opp.poleA} vs ${opp.poleB} · ${opp.gap} pts`} size="sm" />
                      <p style={{ color: '#94A3B8', fontSize: '0.78rem', lineHeight: 1.55, margin: '5px 0 0' }}>{opp.advice}</p>
                    </div>
                  ))}
                  {pair.sharedPoles.length > 0 && (
                    <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '4px 0 0' }}>
                      Terrain commun : {pair.sharedPoles.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {affinities.length > 0 && (
            <>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, margin: '16px 0 8px' }}>
                Duos les plus alignés
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {affinities.map(pair => (
                  <Badge key={`${pair.playerIdA}-${pair.playerIdB}`} color="#00E5A0" size="sm"
                    label={`${nameOf.get(pair.playerIdA)} + ${nameOf.get(pair.playerIdB)} · ${pair.sharedPoles.join('')}`} />
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {detailFor && (
        <MbtiDetailModal name={detailFor.name} result={detailFor.result} submittedAt={detailFor.submittedAt}
          onClose={() => setDetailFor(null)} />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countTypes(rows: { result: { code: string } }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.result.code, (counts.get(row.result.code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const th: React.CSSProperties = {
  padding: '7px 12px', textAlign: 'left', fontSize: '0.67rem', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A',
};
const td: React.CSSProperties = { padding: '9px 12px', fontSize: '0.83rem' };

function btn(bg: string, color = '#0D0F14'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 12px', backgroundColor: bg, color,
    border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
  };
}
