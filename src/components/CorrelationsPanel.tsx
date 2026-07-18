import { useState, useEffect, useMemo } from 'react';
import { Activity, GitCompare } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { IndicatorSelect } from './IndicatorSelect';
import { SubjectSelect, TEAM_SUBJECT } from './SubjectSelect';
import { CrossTimelineChart } from './CrossTimelineChart';
import { CorrelationScatterChart } from './CorrelationScatterChart';
import { CorrelationCard } from './CorrelationCard';
import {
  playerAttributeIndicators, teamAttributeIndicators, getSeriesFor, correlateAcrossSubjects, injuryEpisodes,
  type PlayerCrossData, type TeamCrossData, type IndicatorDef, type LagMode, type Subject,
} from '../data/crossAnalysis';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';

interface SubjectAttributeColumnProps {
  roster: PlayerCrossData[];
  subjectId: string; onSubject: (id: string) => void;
  indicators: IndicatorDef[]; attrKey: string; onAttr: (k: string) => void;
  excludeAttrKey?: string;
}

/** Une colonne « Croiser » : sujet (joueur précis ou équipe) puis, en dessous, l'attribut de ce sujet */
function SubjectAttributeColumn({ roster, subjectId, onSubject, indicators, attrKey, onAttr, excludeAttrKey }: SubjectAttributeColumnProps) {
  return (
    <div className="flex flex-col" style={{ gap: 6, flex: 1, minWidth: 190 }}>
      <SubjectSelect players={roster.map(p => p.player)} value={subjectId} onChange={onSubject} />
      <IndicatorSelect indicators={indicators} value={attrKey} onChange={onAttr} excludeKey={excludeAttrKey} />
    </div>
  );
}

function IndicatorControls({
  roster, aSubjectId, bSubjectId, onASubject, onBSubject,
  aIndicators, bIndicators, aKey, bKey, onA, onB,
}: {
  roster: PlayerCrossData[];
  aSubjectId: string; bSubjectId: string;
  onASubject: (id: string) => void; onBSubject: (id: string) => void;
  aIndicators: IndicatorDef[]; bIndicators: IndicatorDef[];
  aKey: string; bKey: string;
  onA: (k: string) => void; onB: (k: string) => void;
}) {
  // Même sujet des deux côtés (même joueur, ou équipe des deux côtés) : on empêche de choisir
  // deux fois le même attribut. Sujets différents : le même attribut a un sens des deux côtés
  // (ex. « Charge » du joueur X vs « Charge » du joueur Y).
  const sameSubjectBothSides = aSubjectId === bSubjectId;
  return (
    <Card style={{ padding: '10px 14px', marginBottom: 14 }}>
      <div className="flex flex-col md:flex-row md:items-start" style={{ gap: 10 }}>
        <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, paddingTop: 8 }}>
          Croiser
        </span>
        <SubjectAttributeColumn
          roster={roster} subjectId={aSubjectId} onSubject={onASubject}
          indicators={aIndicators} attrKey={aKey} onAttr={onA}
          excludeAttrKey={sameSubjectBothSides ? bKey : undefined}
        />
        <span style={{ color: '#475569', fontWeight: 700, textAlign: 'center', flexShrink: 0, alignSelf: 'center' }}>×</span>
        <SubjectAttributeColumn
          roster={roster} subjectId={bSubjectId} onSubject={onBSubject}
          indicators={bIndicators} attrKey={bKey} onAttr={onB}
          excludeAttrKey={sameSubjectBothSides ? aKey : undefined}
        />
      </div>
    </Card>
  );
}

export interface CorrelationsPanelProps {
  roster: PlayerCrossData[];
  /** Périmètre équipe (roster + stats matchs équipe) pour agréger un sujet "Équipe" */
  team: TeamCrossData | undefined;
  from: string; to: string;
  thresholds: LoadThresholds;
  /** Sujet initial des deux côtés (joueur courant sur la page joueur, TEAM_SUBJECT sur la page équipe) */
  defaultSubjectId: string;
}

/** Onglet "Corrélations" — identique sur Performance individuelle et Performance collective :
 * on choisit un sujet (joueur précis ou équipe) et un attribut de chaque côté, la page d'origine
 * ne fait que présélectionner un sujet par défaut. */
export function CorrelationsPanel({ roster, team, from, to, thresholds, defaultSubjectId }: CorrelationsPanelProps) {
  const [aSubjectId, setASubjectId] = useState('');
  const [bSubjectId, setBSubjectId] = useState('');
  useEffect(() => {
    // Ne préremplit qu'à la première disponibilité de `defaultSubjectId` — un choix déjà fait par
    // l'utilisateur n'est jamais écrasé par un changement ailleurs sur la page.
    if (!defaultSubjectId) return;
    if (!aSubjectId) setASubjectId(defaultSubjectId);
    if (!bSubjectId) setBSubjectId(defaultSubjectId);
  }, [defaultSubjectId]);
  const [aKey, setAKey] = useState('loadUa');
  const [bKey, setBKey] = useState('eval');
  const [lagDays, setLagDays] = useState<LagMode>('week');

  const aSubject: Subject | undefined = useMemo(() => {
    if (aSubjectId === TEAM_SUBJECT) return { kind: 'team' };
    const p = roster.find(pl => pl.player.id === aSubjectId);
    return p ? { kind: 'player', player: p } : undefined;
  }, [aSubjectId, roster]);
  const bSubject: Subject | undefined = useMemo(() => {
    if (bSubjectId === TEAM_SUBJECT) return { kind: 'team' };
    const p = roster.find(pl => pl.player.id === bSubjectId);
    return p ? { kind: 'player', player: p } : undefined;
  }, [bSubjectId, roster]);

  // Liste d'attributs affichée sous chaque sélecteur de sujet : bascule joueur ↔ équipe
  const aIsTeamSubject = aSubjectId === TEAM_SUBJECT;
  const bIsTeamSubject = bSubjectId === TEAM_SUBJECT;
  const aIndicators = useMemo(() => aIsTeamSubject ? teamAttributeIndicators() : playerAttributeIndicators(), [aIsTeamSubject]);
  const bIndicators = useMemo(() => bIsTeamSubject ? teamAttributeIndicators() : playerAttributeIndicators(), [bIsTeamSubject]);
  // Si l'attribut choisi n'existe pas dans la nouvelle liste (ex. bascule vers Équipe), on retombe
  // sur le premier attribut de cette liste plutôt que de garder une sélection invalide.
  useEffect(() => {
    if (aIndicators.length && !aIndicators.some(i => i.key === aKey)) setAKey(aIndicators[0].key);
  }, [aIndicators]);
  useEffect(() => {
    if (bIndicators.length && !bIndicators.some(i => i.key === bKey)) setBKey(bIndicators[0].key);
  }, [bIndicators]);
  const aDef = aIndicators.find(i => i.key === aKey) ?? aIndicators[0];
  const bDef = bIndicators.find(i => i.key === bKey) ?? bIndicators[0];

  const seriesA = useMemo(() => aSubject ? getSeriesFor(aDef, aSubject, team, from, to) : [], [aSubject, aDef, team, from, to]);
  const seriesB = useMemo(() => bSubject ? getSeriesFor(bDef, bSubject, team, from, to) : [], [bSubject, bDef, team, from, to]);
  const corr = useMemo(
    () => aSubject && bSubject ? correlateAcrossSubjects(aDef, aSubject, bDef, bSubject, team, from, to, lagDays) : null,
    [aSubject, bSubject, aDef, bDef, team, from, to, lagDays],
  );
  // Surimpression blessure du nuage/de la chronologie : le joueur d'un des deux côtés s'il y en a un
  // (si les deux côtés sont des joueurs différents, on garde celui de gauche).
  const injurySubjectPlayer = aSubject?.kind === 'player' ? aSubject.player : bSubject?.kind === 'player' ? bSubject.player : undefined;
  const injuries = useMemo(() => injurySubjectPlayer ? injuryEpisodes(injurySubjectPlayer.medical, from, to) : [], [injurySubjectPlayer, from, to]);

  return (
    <>
      <IndicatorControls
        roster={roster}
        aSubjectId={aSubjectId} bSubjectId={bSubjectId} onASubject={setASubjectId} onBSubject={setBSubjectId}
        aIndicators={aIndicators} bIndicators={bIndicators}
        aKey={aKey} bKey={bKey} onA={setAKey} onB={setBKey}
      />

      {/* Verdict : les deux facteurs sont-ils liés, et peut-on s'y fier (test de significativité) ? */}
      <div style={{ marginBottom: 14 }}>
        <CorrelationCard a={aDef} b={bDef} result={corr} lagDays={lagDays} onLagChange={setLagDays} />
      </div>

      {/* Preuve visuelle : nuage des paires exactes utilisées pour le calcul du verdict ci-dessus */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle icon={<GitCompare size={12} style={{ color: '#00E5A0' }} />} mb={10}
          info={corr ? `${corr.n} observations appariées` : undefined}>
          Nuage de points
        </CardTitle>
        {corr ? (
          <CorrelationScatterChart a={aDef} b={bDef} pairs={corr.pairs} injuries={injuries} />
        ) : (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.82rem', textAlign: 'center' }}>
            Pas assez de paires sur cette période pour tracer le nuage de points.
          </div>
        )}
      </Card>

      {/* Contexte temporel : les deux séries brutes superposées, sans le décalage/fenêtre du calcul ci-dessus */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle icon={<Activity size={12} style={{ color: '#00E5A0' }} />} mb={10}
          info="Contexte — séries brutes, non décalées">
          Chronologie croisée
        </CardTitle>
        <CrossTimelineChart
          a={{ def: aDef, points: seriesA }} b={{ def: bDef, points: seriesB }}
          from={from} to={to} injuries={injuries} loadThresholds={thresholds}
        />
      </Card>
    </>
  );
}
