import { forwardRef, useRef, useImperativeHandle } from 'react';
import { Ambulance } from 'lucide-react';
import { Card } from './Card';
import { HeroCard } from './HeroCard';
import { PlayerMedicalView, type PlayerMedicalViewHandle } from './PlayerMedicalView';
import { playerStatusColor, playerStatusLabel } from './PlayerHero';
import { fmtDate } from '../utils/dateFormat';
import type { MedicalRecord, Player } from '../data/types';

interface PlayerMedicalOverviewProps {
  player: Player;
  playerId: string;
  /** Blessure active en cours (status === 'active'), si applicable */
  currentInjury: MedicalRecord | null;
  /** Blessure la plus récente, active ou non */
  lastInjury: MedicalRecord | null;
  seasonInjuryCount: number;
  seasonInjuryDays: number;
  onUpdated?: () => void;
}

/**
 * Bandeau de statut médical + KPIs + historique (PlayerMedicalView) — bloc complet partagé
 * entre l'onglet Médical de Performance individuelle et l'onglet "Historique joueur" de la
 * page Médicale, pour garantir un rendu identique dans les deux endroits.
 */
export const PlayerMedicalOverview = forwardRef<PlayerMedicalViewHandle, PlayerMedicalOverviewProps>(
  ({ player, playerId, currentInjury, lastInjury, seasonInjuryCount, seasonInjuryDays, onUpdated }, ref) => {
    const viewRef = useRef<PlayerMedicalViewHandle>(null);
    useImperativeHandle(ref, () => ({
      openForm: () => viewRef.current?.openForm(),
      openRecord: (record: MedicalRecord) => viewRef.current?.openRecord(record),
    }));

    return (
      <div>
        <Card accentColor={playerStatusColor[player.status]} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              backgroundColor: `${playerStatusColor[player.status]}1F`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ambulance size={22} style={{ color: playerStatusColor[player.status] }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
                Statut médical
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: playerStatusColor[player.status] }}>
                {playerStatusLabel[player.status]}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: 4 }}>
                {player.status === 'active'
                  ? 'Aucun problème médical actif'
                  : [
                      currentInjury?.description,
                      currentInjury?.rtpDate ? `Reprise prévue le ${fmtDate(currentInjury.rtpDate)}` : null,
                    ].filter(Boolean).join(' · ') || 'Statut à surveiller'}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, marginBottom: 14 }}>
          <HeroCard
            icon={<Ambulance size={20} color={lastInjury ? '#EF4444' : '#475569'} />} iconBg={lastInjury ? '#EF444422' : '#47556922'}
            title="Dernière blessure"
            ctaLabel={lastInjury ? 'Voir le détail' : undefined}
            onOpen={lastInjury ? () => viewRef.current?.openRecord(lastInjury) : undefined}
            stats={[{ value: lastInjury ? lastInjury.description : '—', label: lastInjury ? fmtDate(lastInjury.date) : 'Aucune blessure enregistrée', color: lastInjury ? '#EF4444' : '#475569' }]}
          />
          <HeroCard
            icon={<Ambulance size={20} color={seasonInjuryCount > 0 ? '#F59E0B' : '#00E5A0'} />} iconBg={seasonInjuryCount > 0 ? '#F59E0B22' : '#00E5A022'}
            title="Blessures cette saison"
            stats={[{ value: seasonInjuryCount, label: 'cette saison', color: seasonInjuryCount > 0 ? '#F59E0B' : '#00E5A0' }]}
          />
          <HeroCard
            icon={<Ambulance size={20} color={seasonInjuryDays > 0 ? '#3B82F6' : '#00E5A0'} />} iconBg={seasonInjuryDays > 0 ? '#3B82F622' : '#00E5A022'}
            title="Jours blessés"
            stats={[{ value: seasonInjuryDays, label: 'cumulés saison', color: seasonInjuryDays > 0 ? '#3B82F6' : '#00E5A0' }]}
          />
        </div>

        <PlayerMedicalView key={playerId} ref={viewRef} playerId={playerId} onUpdated={onUpdated} />
      </div>
    );
  },
);
