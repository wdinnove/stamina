import {
  ReportTitle, BlockTitle, StatBlock, StatRow, Findings, reportDate,
  MUTED, FAINT, LINE, SOFT, ACCENT, INK, type Tone,
} from './ReportKit';
import { PlayerAvatar } from './PlayerAvatar';
import { playerStatusLabel } from './PlayerHero';
import { getAge } from '../data';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

/**
 * La page d'ouverture : ce qu'on retient si on ne lit que la première page.
 *
 * Elle n'appartient à aucune section — elle remonte les 4 chiffres décisifs et les constats
 * transverses, puis annonce ce que contient la suite du document.
 */
export function ReportSummary({
  teamName, seasonLabel, player, from, to, generatedOn, stats, findings, sections,
}: {
  teamName: string;
  seasonLabel: string;
  /** Absent = rapport d'équipe. */
  player?: Player;
  from: string;
  to: string;
  generatedOn: string;
  stats: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; tone?: Tone }[];
  findings: { tone: Tone; text: string }[];
  /** Sommaire : les sections effectivement incluses, dans l'ordre du document. */
  sections: string[];
}) {
  return (
    <>
      <ReportTitle
        title={player ? 'Rapport individuel' : "Rapport d'équipe"}
        subject={player ? playerNameFull(player) : teamName}
        meta={[
          { label: 'Période couverte', value: `${reportDate(from)} → ${reportDate(to)}` },
          { label: 'Établi le',        value: reportDate(generatedOn) },
          { label: player ? 'Équipe' : 'Saison', value: player ? `${teamName} · ${seasonLabel}` : seasonLabel },
        ]}
      />

      {player && <PlayerIdentity player={player} />}

      <BlockTitle>Chiffres clés de la période</BlockTitle>
      <StatRow columns={stats.length >= 4 ? 4 : Math.max(stats.length, 1)}>
        {stats.map(s => <StatBlock key={s.label} {...s} />)}
      </StatRow>

      <div style={{ marginBottom: 22 }}>
        <Findings items={findings} />
      </div>

      <div>
        <BlockTitle>Contenu du rapport</BlockTitle>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {sections.map((label, i) => (
            <li key={label} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
              borderBottom: i < sections.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, width: 20 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
              <span style={{ flex: 1, borderBottom: `1px dotted ${LINE}` }} />
              <span style={{ fontSize: 10.5, color: FAINT }}>p. {i + 2}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** L'état civil du joueur, tel qu'il ouvre un rapport individuel. */
function PlayerIdentity({ player }: { player: Player }) {
  const facts = [
    player.number ? `#${player.number}` : null,
    player.position,
    player.birthDate ? `${getAge(player.birthDate)} ans` : null,
    player.height && player.weight ? `${player.height} cm · ${player.weight} kg` : null,
    player.nationality,
  ].filter(Boolean) as string[];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: 14, marginBottom: 22,
      backgroundColor: SOFT, border: `1px solid ${LINE}`, borderRadius: 4,
    }}>
      <PlayerAvatar player={player} size={64} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>{playerNameFull(player)}</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED }}>{facts.join(' · ')}</p>
        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: MUTED }}>
          Statut à ce jour : <strong style={{ color: INK }}>{playerStatusLabel[player.status]}</strong>
        </p>
      </div>
    </div>
  );
}
