import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { CATEGORY_LABELS, DIMENSIONS_V1, confidenceNote } from '../data/archetypes';
import type { ArchetypeCategory, ArchetypeResult, StyleDimensionResult, DimensionDefinition, PlayerArchetypeReport } from '../data/archetypes';

const CATEGORY_COLORS: Record<ArchetypeCategory, string> = {
  meneurs: '#3B82F6',
  shooteurs: '#F59E0B',
  createurs: '#8B5CF6',
  attaque_cercle: '#EF4444',
  interieurs: '#06B6D4',
  polyvalents: '#EC4899',
  defense: '#00E5A0',
  energie: '#FB923C',
};

const BETA_COLOR = '#8B5CF6';
const ESTIMATE_COLOR = '#F59E0B';
const DIMENSION_COLOR = '#00E5A0';

interface PlayerArchetypesPanelProps {
  playerId: string;
  reports: PlayerArchetypeReport[];
  loading: boolean;
  error?: unknown;
}

export function PlayerArchetypesPanel({ playerId, reports, loading, error }: PlayerArchetypesPanelProps) {
  if (loading) return <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;

  if (error) {
    return <Card><EmptyState message="Impossible de calculer les profils pour le moment — réessaie dans un instant." /></Card>;
  }

  const report = reports.find(r => r.playerId === playerId);
  if (!report) {
    return <Card><EmptyState message="Pas assez de matchs cette saison pour calculer des profils." /></Card>;
  }

  const computable = [...report.archetypes]
    .filter(a => a.computable)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const notComputable = report.archetypes.filter(a => !a.computable);
  const firstComputable = report.archetypes.find(a => a.computable) ?? report.dimensions.find(d => d.computable);
  const sample = firstComputable?.sampleSize;
  const confidence = firstComputable?.confidence;

  return (
    <div>
      <div style={{
        marginBottom: 20, padding: '12px 14px', borderRadius: 8,
        backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${BETA_COLOR}`,
        display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
      }}>
        <Badge color={BETA_COLOR} label="BÊTA" size="sm" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.6, flex: 1, minWidth: 220 }}>
          Profils calculés à partir des statistiques de la saison, comparés au reste de l'effectif — pas à une
          référence extérieure. Un badge <Badge color={ESTIMATE_COLOR} label="Estimation" size="sm" style={{ verticalAlign: 'middle' }} /> signale
          un profil approché faute de données de type de jeu (drives, écrans, tirs par zone…).
          {sample && <> Basé sur <strong style={{ color: '#F1F5F9' }}>{sample.matches} match{sample.matches > 1 ? 's' : ''}</strong> ({Math.round(sample.minutes)} min) cette saison
          {confidence !== 'high' && <> — échantillon {confidence === 'low' ? 'limité' : 'moyen'}, scores à prendre avec prudence</>}.</>}
        </p>
      </div>

      {computable.length === 0 ? (
        <Card><EmptyState message="Historique de matchs encore trop court cette saison pour calculer des profils fiables." /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 12 }}>
          {computable.map(a => <ArchetypeCard key={a.profileKey} result={a} />)}
        </div>
      )}

      {notComputable.length > 0 && (
        <p style={{ color: '#475569', fontSize: '0.7rem', margin: '12px 0 0' }}>
          {notComputable.length} profil{notComputable.length > 1 ? 's' : ''} non calculé{notComputable.length > 1 ? 's' : ''} par manque
          d'historique cette saison : {notComputable.map(a => a.label).join(', ')}.
        </p>
      )}

      <h3 style={{ color: '#F1F5F9', fontSize: '0.95rem', margin: '28px 0 4px' }}>Dimensions de style</h3>
      <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 14px' }}>
        Notées de 0 à 100, indépendamment des profils ci-dessus, par rapport au reste de l'effectif.
      </p>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {DIMENSIONS_V1.map(dim => (
            <DimensionRow key={dim.key} dim={dim} result={report.dimensions.find(d => d.dimensionKey === dim.key)} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function ArchetypeCard({ result }: { result: ArchetypeResult }) {
  const color = CATEGORY_COLORS[result.category];
  const score = result.score ?? 0;
  const hasDetails = result.topPositive.length > 0 || result.topNegative.length > 0;

  return (
    <Card accentColor={color} style={{ display: 'flex', flexDirection: 'column' }}>
      <CardTitle mb={8}>{CATEGORY_LABELS[result.category]}</CardTitle>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.92rem', flex: 1, minWidth: 0 }}>{result.label}</span>
        {/* Deux informations distinctes, deux badges. « Estimation » dit comment le profil est
            construit (limite permanente de la méthode) ; « ? » dit si le score de CE joueur
            repose sur assez de données. Les fondre dans un seul tooltip empêchait de savoir
            laquelle des deux on lisait. */}
        {result.confidence !== 'high' && (
          <span title={confidenceNote(result.confidence, result.sampleSize) ?? undefined} style={{ cursor: 'help', flexShrink: 0 }}>
            <Badge color="#F59E0B" label="?" size="sm" />
          </span>
        )}
        {result.caveat && (
          <span title={result.caveat} style={{ cursor: 'help', flexShrink: 0 }}>
            <Badge color={ESTIMATE_COLOR} label="Estimation" size="sm" />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score}%`, backgroundColor: color, borderRadius: 4 }} />
        </div>
        <span style={{ color, fontWeight: 700, fontSize: '0.85rem', width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {score}%
        </span>
      </div>

      {hasDetails && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ color: '#64748B', fontSize: '0.7rem', cursor: 'pointer', userSelect: 'none' }}>Pourquoi ce score ?</summary>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {result.topPositive.map(c => <Badge key={c.featureKey} color="#00E5A0" label={`↑ ${c.label}`} size="sm" />)}
            {result.topNegative.map(c => <Badge key={c.featureKey} color="#EF4444" label={`↓ ${c.label}`} size="sm" />)}
          </div>
        </details>
      )}
    </Card>
  );
}

function DimensionRow({ dim, result }: { dim: DimensionDefinition; result?: StyleDimensionResult }) {
  if (!result || !result.computable) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.5 }}>
        <span style={{ width: 150, flexShrink: 0, fontSize: '0.8rem', color: '#94A3B8' }}>{dim.label}</span>
        <div style={{ flex: 1, height: 8, backgroundColor: '#1E2229', borderRadius: 4 }} />
        <span style={{ fontSize: '0.68rem', color: '#475569', width: 100, textAlign: 'right', flexShrink: 0 }}>
          {dim.status === 'planned' ? 'Bientôt (Phase 2)' : 'Historique insuffisant'}
        </span>
      </div>
    );
  }
  const score = result.score ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{ width: 150, flexShrink: 0, fontSize: '0.8rem', color: '#F1F5F9', fontWeight: 600 }}
        title={dim.caveat}
      >
        {dim.label}{dim.status === 'partial_proxy' ? ' *' : ''}
      </span>
      <div style={{ flex: 1, height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, backgroundColor: DIMENSION_COLOR, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: DIMENSION_COLOR, width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </span>
      {/* Même séparation que pour les profils : `*` + tooltip du libellé = limite de méthode,
          `?` = fiabilité de l'échantillon de ce joueur. */}
      <span style={{ width: 14, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {result.confidence !== 'high' && (
          <span title={confidenceNote(result.confidence, result.sampleSize) ?? undefined} style={{ cursor: 'help' }}>
            <Badge color="#F59E0B" label="?" size="sm" />
          </span>
        )}
      </span>
    </div>
  );
}
