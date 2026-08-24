import { PlayerHero } from './PlayerHero';
import { fmtDateFull } from '../utils/dateFormat';
import type { Player } from '../data/types';

/**
 * L'en-tête du document généré. Un rapport doit s'auto-décrire : sorti de l'app, un PDF sans
 * date ni période est ininterprétable — on ne sait plus ni quand il a été produit, ni ce qu'il
 * couvre. Les deux sont donc écrits sur le document, pas seulement utilisés pour filtrer.
 *
 * Le sujet joueur reprend `PlayerHero` tel quel : photo et infos perso identiques à sa fiche.
 */
export function ReportHeader({ teamName, seasonLabel, player, from, to, generatedOn }: {
  teamName: string;
  seasonLabel: string;
  /** Absent = rapport d'équipe. */
  player?: Player;
  from: string;
  to: string;
  /** Date de génération, au format ISO. */
  generatedOn: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', paddingBottom: 14, borderBottom: '1px solid #2A2F3A', marginBottom: 14,
      }}>
        <div>
          <h1 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            {player ? 'Rapport joueur' : "Rapport d'équipe"}
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '4px 0 0' }}>
            {teamName} · {seasonLabel}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>
            Établi le {fmtDateFull(generatedOn)}
          </p>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '2px 0 0' }}>
            Période : du {fmtDateFull(from)} au {fmtDateFull(to)}
          </p>
        </div>
      </div>

      {player && <PlayerHero player={player} marginBottom={0} />}
    </div>
  );
}

/** Le titre qui ouvre chaque section du rapport — une barre par domaine, toutes identiques. */
export function ReportSectionTitle({ label }: { label: string }) {
  return (
    <h2 style={{
      color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px',
      paddingBottom: 8, borderBottom: '1px solid #2A2F3A',
    }}>
      {label}
    </h2>
  );
}
