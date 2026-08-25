import {
  ReportTitle, BlockTitle, StatBlock, StatRow, Findings, reportDate,
  FAINT, LINE, ACCENT, type Tone,
} from './ReportKit';
import { PlayerIdentity } from './ReportPlayerIdentity';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

/**
 * La page d'ouverture : ce qu'on retient si on ne lit que la première page.
 *
 * Elle n'appartient à aucune section — elle remonte les 4 chiffres décisifs et les constats
 * transverses, puis annonce ce que contient la suite du document.
 */
/** Nombre de sujets listés au sommaire — au-delà, la page d'ouverture déborderait. */
const TOC_CAP = 12;

/** Une entrée du sommaire : un sujet du rapport et les sections qu'il couvre. */
export interface SummaryEntry {
  /** Le sujet : « Équipe » ou le nom du joueur. */
  label: string;
  /** Les sections qu'il couvre : « Bien-être · Médical ». */
  scope: string;
  /** Première et dernière page du sujet dans le document. */
  fromPage: number;
  toPage: number;
}

export function ReportSummary({
  teamName, seasonLabel, teamLevel, soloPlayer, playerCount, playerNames = [],
  from, to, generatedOn, stats, findings, entries,
}: {
  teamName: string;
  seasonLabel: string;
  /** Au moins une section a été demandée au niveau du groupe — sinon c'est un rapport individuel. */
  teamLevel: boolean;
  /** Le seul joueur couvert, quand le rapport ne concerne que lui : son état civil ouvre alors le
   *  document, comme une fiche. Au-delà, chaque bloc individuel porte son propre bandeau. */
  soloPlayer?: Player;
  /** Nombre de joueurs distincts couverts, toutes sections confondues. */
  playerCount: number;
  /** Leurs noms, listés en ouverture dès qu'ils sont plusieurs : le lecteur doit savoir qui est
   *  dans le document sans avoir à le feuilleter. */
  playerNames?: string[];
  from: string;
  to: string;
  generatedOn: string;
  /** Chiffres clés collectifs — vide si aucune section n'a été demandée au niveau de l'équipe. */
  stats: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; tone?: Tone }[];
  findings: { tone: Tone; text: string }[];
  entries: SummaryEntry[];
}) {
  // Le sommaire tient sur la page d'ouverture : au-delà, il annonce le reste plutôt que de
  // déborder sur une seconde page qui ne contiendrait qu'une suite de lignes.
  const shown  = entries.slice(0, TOC_CAP);
  const hidden = entries.length - shown.length;

  return (
    <>
      <ReportTitle
        title={teamLevel ? "Rapport d'équipe" : playerCount > 1 ? 'Rapport individuel — plusieurs joueurs' : 'Rapport individuel'}
        subject={soloPlayer ? playerNameFull(soloPlayer) : teamName}
        meta={[
          { label: 'Période couverte', value: `${reportDate(from)} → ${reportDate(to)}` },
          { label: 'Établi le',        value: reportDate(generatedOn) },
          { label: soloPlayer ? 'Équipe' : 'Saison', value: soloPlayer ? `${teamName} · ${seasonLabel}` : seasonLabel },
          ...(playerCount > 0 && !soloPlayer
            ? [{ label: 'Joueurs détaillés', value: `${playerCount}` }]
            : []),
        ]}
      />

      {soloPlayer && <PlayerIdentity player={soloPlayer} />}

      {stats.length > 0 && (
        <>
          <BlockTitle>
            {teamLevel ? "Chiffres clés de l'équipe sur la période" : 'Chiffres clés de la période'}
          </BlockTitle>
          <StatRow columns={stats.length >= 4 ? 4 : Math.max(stats.length, 1)}>
            {stats.map(s => <StatBlock key={s.label} {...s} />)}
          </StatRow>
        </>
      )}

      {playerNames.length > 1 && (
        <div style={{ marginBottom: 22 }}>
          <BlockTitle>Joueurs détaillés dans ce rapport</BlockTitle>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6 }}>{playerNames.join(' · ')}</p>
        </div>
      )}

      {findings.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Findings items={findings} />
        </div>
      )}

      <div>
        <BlockTitle>Contenu du rapport</BlockTitle>
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {shown.map((e, i) => (
            <li key={e.label} style={{
              display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0',
              borderBottom: i < shown.length - 1 ? `1px solid ${LINE}` : 'none',
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, width: 20, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{e.label}</span>
              {/* La liste des sections peut être longue : elle cède la place au numéro de page,
                  qui est l'information qu'on vient chercher dans un sommaire. */}
              <span style={{
                fontSize: 10.5, color: FAINT, flex: '0 1 auto', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {e.scope}
              </span>
              <span style={{ flex: '1 0 14px', borderBottom: `1px dotted ${LINE}` }} />
              <span style={{ fontSize: 10.5, color: FAINT, flexShrink: 0 }}>
                {e.fromPage === e.toPage ? `p. ${e.fromPage}` : `p. ${e.fromPage}–${e.toPage}`}
              </span>
            </li>
          ))}
        </ol>
        {hidden > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 10, color: FAINT, fontStyle: 'italic' }}>
            + {hidden} autre{hidden > 1 ? 's' : ''} sujet{hidden > 1 ? 's' : ''}, dans le même ordre, jusqu'à la page {entries[entries.length - 1].toPage}.
          </p>
        )}
      </div>
    </>
  );
}
