import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Settings } from 'lucide-react';
import { ResponsiveTabNav, type TabNavGroup } from '../components/ResponsiveTabNav';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { TeamConfigSection, teamSections, type TeamSection } from './ConfigPage';
import { ClubConfigSection, CLUB_SECTIONS, type ClubSection } from './ClubPage';

// Un seul sous-menu, deux sections : Club (superadmin) et Équipe (admin d'équipe,
// ou editor pour les seules sections ouvertes à editor+). Chaque onglet a son URL
// dédiée : /configuration/<scope>/<section> — partageable et rechargeable.
type Active = { scope: 'club'; key: ClubSection } | { scope: 'team'; key: TeamSection };

const SCOPE_SLUGS: Record<Active['scope'], string> = { club: 'club', team: 'equipe' };

const CLUB_SLUGS: Record<ClubSection, string> = {
  info:    'informations',
  teams:   'equipes',
  players: 'joueurs',
  roles:   'roles',
};

const TEAM_SLUGS: Record<TeamSection, string> = {
  info:       'informations',
  roster:     'effectif',
  staff:      'staff',
  thresholds: 'seuils',
  wellness:   'bien-etre',
  notifs:     'notifications',
  categories: 'categories',
  tactical:   'tactique',
  roles:      'roles',
};

const sectionSlug = (a: Active) => a.scope === 'club' ? CLUB_SLUGS[a.key] : TEAM_SLUGS[a.key];
const sectionPath = (a: Active) => `/configuration/${SCOPE_SLUGS[a.scope]}/${sectionSlug(a)}`;

/** URL → onglet. null si le scope ou la section n'existe pas (URL obsolète ou tronquée). */
function parseUrl(scopeSlug?: string, slug?: string): Active | null {
  if (scopeSlug === SCOPE_SLUGS.club) {
    const key = (Object.keys(CLUB_SLUGS) as ClubSection[]).find(k => CLUB_SLUGS[k] === slug);
    return key ? { scope: 'club', key } : null;
  }
  if (scopeSlug === SCOPE_SLUGS.team) {
    const key = (Object.keys(TEAM_SLUGS) as TeamSection[]).find(k => TEAM_SLUGS[k] === slug);
    return key ? { scope: 'team', key } : null;
  }
  return null;
}

export default function ConfigurationPage() {
  const navigate = useNavigate();
  const { scope: scopeSlug, section: slug } = useParams<{ scope?: string; section?: string }>();
  const { isSuperadmin, roleLoading, teamRoleLoading, canConfigureTeam, canEditTeamData } = useTeamSeason();

  const rolesLoading = roleLoading || teamRoleLoading;
  const clubSections: { key: ClubSection; label: string }[] = isSuperadmin ? [...CLUB_SECTIONS] : [];
  const availableTeamSections = teamSections(canConfigureTeam, canEditTeamData);

  const fromUrl = parseUrl(scopeSlug, slug);
  const urlIsVisible = fromUrl !== null && (fromUrl.scope === 'club'
    ? clubSections.some(s => s.key === fromUrl.key)
    : availableTeamSections.some(s => s.key === fromUrl.key));

  const fallback: Active | null =
    clubSections.length > 0            ? { scope: 'club', key: clubSections[0].key } :
    availableTeamSections.length > 0   ? { scope: 'team', key: availableTeamSections[0].key } :
    null;

  const current = urlIsVisible ? fromUrl : fallback;
  const fallbackPath = fallback ? sectionPath(fallback) : null;

  // /configuration nu, URL obsolète ou onglet devenu inaccessible → on réécrit l'URL
  // sur le premier onglet visible, pour que l'adresse reflète toujours l'onglet affiché.
  useEffect(() => {
    if (rolesLoading || urlIsVisible || !fallbackPath) return;
    navigate(fallbackPath, { replace: true });
  }, [rolesLoading, urlIsVisible, fallbackPath, navigate]);

  // rôles en cours de chargement → on bloque (évite le flash d'un menu incomplet)
  if (rolesLoading) {
    return (
      <div className="p-4 md:p-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-4 md:p-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Settings size={22} style={{ color: '#EF4444' }} />
          </div>
          <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Accès restreint</h2>
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>
            La configuration est réservée à l'admin de l'équipe ou au superadmin de l'organisation.
          </p>
        </div>
      </div>
    );
  }

  // Les clés de nav sont préfixées par leur scope : sinon "roles" existe des deux côtés.
  const groups: TabNavGroup[] = [];
  if (clubSections.length > 0) {
    groups.push({ label: 'Club', tabs: clubSections.map(s => ({ key: `club:${s.key}`, slug: sectionPath({ scope: 'club', key: s.key }), label: s.label })) });
  }
  if (availableTeamSections.length > 0) {
    groups.push({ label: 'Équipe', tabs: availableTeamSections.map(s => ({ key: `team:${s.key}`, slug: sectionPath({ scope: 'team', key: s.key }), label: s.label })) });
  }

  return (
    <div className="p-4 md:p-6">
      <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Configuration</h1>

      <div className="flex flex-col lg:flex-row" style={{ gap: 20 }}>
        <div style={{ marginBottom: 4 }}>
          <ResponsiveTabNav groups={groups} activeKey={`${current.scope}:${current.key}`} onSelect={path => navigate(path)} />
        </div>

        <div style={{ width: '100%', minWidth: 0, flex: 1 }}>
          {current.scope === 'club'
            ? <ClubConfigSection section={current.key} />
            : <TeamConfigSection section={current.key} />}
        </div>
      </div>
    </div>
  );
}
