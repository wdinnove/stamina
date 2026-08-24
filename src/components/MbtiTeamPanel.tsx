import { useMemo, useState } from 'react';
import { Copy, Check, Mail, Users, Zap, X, Sparkles } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { Disclaimer } from './MbtiPlayerPanel';
import { MbtiDetailModal } from './MbtiDetailModal';
import { sendMbtiLinks } from '../api/email';
import { useMbtiResponses } from '../hooks/useMbtiResponses';
import {
  MBTI_PROFILES_V1, safeComputeMbtiResult, tieLabel,
  axisSpread, frictionPairs, affinityPairs, type MbtiPlayerResult, type MbtiResult,
} from '../data/mbti';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { copyToClipboard, mbtiPublicUrl } from '../utils/publicLinks';
import type { Player } from '../data/types';

const ACCENT = '#8B5CF6';

interface MbtiTeamPanelProps {
  roster: Player[];
  teamId?: string;
}

export function MbtiTeamPanel({ roster, teamId }: MbtiTeamPanelProps) {
  const playerIds = useMemo(() => roster.map(p => p.id), [roster]);
  const { responses, loading, reload } = useMbtiResponses(playerIds);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSelected, setLinkSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; skipped: string[]; failed: string[] } | null>(null);
  const [sendError, setSendError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<{ name: string; result: MbtiResult; submittedAt: string } | null>(null);

  const { answered, pending, results } = useMemo(() => {
    const byPlayer = new Map(responses.map(r => [r.playerId, r]));
    const answeredRows: { player: Player; submittedAt: string; result: NonNullable<ReturnType<typeof safeComputeMbtiResult>> }[] = [];
    const pendingRows: Player[] = [];
    for (const player of roster) {
      const response = byPlayer.get(player.id);
      const result = safeComputeMbtiResult(response?.answers);
      if (response && result) answeredRows.push({ player, submittedAt: response.submittedAt, result });
      else pendingRows.push(player);
    }
    answeredRows.sort((a, b) => playerNameShort(a.player).localeCompare(playerNameShort(b.player)));
    return {
      answered: answeredRows,
      pending: pendingRows,
      results: answeredRows.map(r => ({ playerId: r.player.id, result: r.result })) as MbtiPlayerResult[],
    };
  }, [roster, responses]);

  const nameOf = useMemo(
    () => new Map(roster.map(p => [p.id, playerNameShort(p)])),
    [roster],
  );

  const spread    = useMemo(() => axisSpread(results), [results]);
  const frictions = useMemo(() => frictionPairs(results), [results]);
  const affinities = useMemo(() => affinityPairs(results, 3), [results]);

  async function handleCopy(playerId: string) {
    const ok = await copyToClipboard(mbtiPublicUrl(playerId));
    if (ok) { setCopiedId(playerId); setTimeout(() => setCopiedId(null), 2000); }
  }

  function openLinkModal() {
    setLinkSelected(new Set(pending.filter(p => p.email).map(p => p.id)));
    setSendResult(null);
    setSendError('');
    setShowLinkModal(true);
  }

  async function handleSendLinks() {
    if (!teamId) return;
    setSending(true);
    setSendResult(null);
    setSendError('');
    try {
      // Le serveur relit l'effectif et compose le message : on ne transmet que la sélection.
      const res = await sendMbtiLinks(teamId, [...linkSelected]);
      setSendResult({ sent: res.sent.length, skipped: res.skipped, failed: res.failed });
      reload();
    } catch (err) {
      const names = pending.filter(p => linkSelected.has(p.id)).map(playerNameFull);
      setSendResult({ sent: 0, skipped: [], failed: names });
      setSendError(err instanceof Error ? err.message : "Échec de l'envoi");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;

  if (!roster.length) {
    return <Card><EmptyState message="Aucun joueur dans l'effectif de cette saison." /></Card>;
  }

  return (
    <div>
      <Disclaimer />

      {/* ── Tableau de l'effectif ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', backgroundColor: '#1A1E26', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} color="#94A3B8" />
          <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>
            Profils de l'effectif
          </p>
          <span style={{ color: '#475569', fontSize: '0.7rem' }}>{answered.length} / {roster.length} renseignés</span>
        </div>

        {answered.length === 0 ? (
          <EmptyState message="Personne n'a encore rempli le questionnaire." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#64748B' }}>
                  {['Joueur', 'Poste', 'Type', 'Profil', 'Passation'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {answered.map(({ player, result, submittedAt }) => {
                  const profile = MBTI_PROFILES_V1[result.candidates[0]];
                  return (
                    <tr key={player.id}
                      onClick={() => setDetailFor({ name: playerNameFull(player), result, submittedAt })}
                      style={{ borderTop: '1px solid #2A2F3A', cursor: 'pointer' }}>
                      <td style={{ ...td, color: '#F1F5F9', fontWeight: 600 }}>{playerNameFull(player)}</td>
                      <td style={{ ...td, color: '#64748B' }}>{player.position}</td>
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
          <CardTitle
            icon={<Mail size={14} color="#F59E0B" />}
            info={`${pending.length} joueur${pending.length > 1 ? 's' : ''}`}
            right={
              <button onClick={openLinkModal} disabled={!teamId} style={btn(ACCENT, '#0D0F14', !teamId)}>
                <Mail size={13} /> Envoyer les liens
              </button>
            }
          >
            En attente de réponse
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map(player => (
              <div key={player.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6 }}>
                <span style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>
                  {playerNameFull(player)}
                  {!player.email && <span style={{ color: '#F59E0B', fontSize: '0.72rem', marginLeft: 8 }}>pas d'email</span>}
                </span>
                <button onClick={() => handleCopy(player.id)} style={btn('#0D0F14', copiedId === player.id ? '#00E5A0' : '#94A3B8')}>
                  {copiedId === player.id ? <Check size={13} /> : <Copy size={13} />}
                  {copiedId === player.id ? 'Copié' : 'Copier le lien'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Répartition de l'équipe ───────────────────────────────────────── */}
      {answered.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <CardTitle icon={<Sparkles size={14} color={ACCENT} />} info={`sur ${answered.length} profil${answered.length > 1 ? 's' : ''}`}>
            Répartition de l'équipe
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
            Deux joueurs ne sont signalés que s'ils penchent chacun d'un côté d'un axe
            <em> et</em> que l'écart est net — des lettres différentes autour du milieu ne changent rien
            au quotidien. Ce sont des hypothèses de lecture, pas des conflits constatés.
          </p>

          {frictions.length === 0 ? (
            <EmptyState message="Aucune opposition marquée dans l'effectif renseigné." size="sm" />
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

      {/* ── Modale d'envoi ────────────────────────────────────────────────── */}
      {showLinkModal && (
        <Modal onClose={() => setShowLinkModal(false)} maxWidth={460} maxHeight="85vh" overlayOpacity={0.7} style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem' }}>Envoyer le questionnaire</h2>
            <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {sendResult ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>
                {sendResult.failed.length > 0 && sendResult.sent === 0 ? '✗' : '✓'}
              </div>
              <p style={{ color: '#F1F5F9', margin: '0 0 4px', fontWeight: 600 }}>
                {sendResult.sent} lien{sendResult.sent > 1 ? 's' : ''} envoyé{sendResult.sent > 1 ? 's' : ''}
              </p>
              {sendResult.failed.length > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, textAlign: 'left' }}>
                  <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 4px', fontWeight: 600 }}>{sendError || "Échec d'envoi"}</p>
                  {sendResult.failed.map(n => <p key={n} style={{ color: '#EF4444', fontSize: '0.75rem', margin: '2px 0' }}>· {n}</p>)}
                </div>
              )}
              {sendResult.skipped.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 14px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, textAlign: 'left' }}>
                  <p style={{ color: '#F59E0B', fontSize: '0.78rem', margin: '0 0 4px', fontWeight: 600 }}>Non envoyés (sans email ou déjà répondu)</p>
                  {sendResult.skipped.map(n => <p key={n} style={{ color: '#F59E0B', fontSize: '0.75rem', margin: '2px 0' }}>· {n}</p>)}
                </div>
              )}
              <button onClick={() => setShowLinkModal(false)} style={{ ...btn('#00E5A0'), marginTop: 20, padding: '8px 24px' }}>Fermer</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                  {linkSelected.size} joueur{linkSelected.size > 1 ? 's' : ''} sélectionné{linkSelected.size > 1 ? 's' : ''}
                </span>
                <button onClick={() => {
                  const withEmail = pending.filter(p => p.email).map(p => p.id);
                  setLinkSelected(prev => prev.size === withEmail.length ? new Set() : new Set(withEmail));
                }} style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', fontSize: '0.78rem' }}>
                  Tout sélectionner / désélectionner
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {pending.map(player => {
                  const hasEmail = !!player.email;
                  const checked  = linkSelected.has(player.id);
                  return (
                    <label key={player.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, backgroundColor: checked ? 'rgba(0,229,160,0.06)' : '#1E2229', border: `1px solid ${checked ? 'rgba(0,229,160,0.2)' : '#2A2F3A'}`, cursor: hasEmail ? 'pointer' : 'not-allowed', opacity: hasEmail ? 1 : 0.45 }}>
                      <input type="checkbox" checked={checked} disabled={!hasEmail}
                        onChange={() => setLinkSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(player.id)) next.delete(player.id); else next.add(player.id);
                          return next;
                        })} />
                      <span style={{ color: '#F1F5F9', fontSize: '0.85rem' }}>{playerNameFull(player)}</span>
                      {!hasEmail && <span style={{ color: '#F59E0B', fontSize: '0.72rem' }}>pas d'email</span>}
                    </label>
                  );
                })}
              </div>

              <button onClick={handleSendLinks} disabled={sending || linkSelected.size === 0}
                style={{ ...btn('#00E5A0', '#0D0F14', sending || linkSelected.size === 0), width: '100%', padding: '11px 16px' }}>
                <Mail size={14} /> {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </>
          )}
        </Modal>
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

function btn(bg: string, color = '#0D0F14', disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '7px 12px', backgroundColor: bg, color,
    border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.78rem',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}
