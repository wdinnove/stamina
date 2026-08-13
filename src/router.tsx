import { createBrowserRouter, Navigate, useParams } from 'react-router';

import { Layout }      from './layout/Layout';
import { RequireAuth } from './components';

/** Anciennes routes Analyse/Performance — redirigent vers Performance collective/individuelle */
function CrossAnalyzeRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/performance-individuelle/${id}/vue-ensemble` : '/performance-individuelle'} replace />;
}
function AnalyseIndividuelleRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/performance-individuelle/${id}/statistiques` : '/performance-individuelle'} replace />;
}
function PlayerPerformanceRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/performance-individuelle/${id}/vue-ensemble` : '/performance-individuelle'} replace />;
}
/** Ancienne fiche joueur (hub) — redirige vers la vue d'ensemble de Performance individuelle */
function RosterPlayerRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/performance-individuelle/${id}/vue-ensemble` : '/performance-individuelle'} replace />;
}

/** Ancien lien public de saisie bien-être — préserve l'id joueur */
function PlayerWellnessLegacyRedirect() {
  const { playerId } = useParams<{ playerId: string }>();
  return <Navigate to={playerId ? `/joueur/${playerId}/bien-etre` : '/connexion'} replace />;
}
/** Ancienne fiche équipe (Club) — préserve l'id */
function TeamLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/equipes/${id}` : '/equipes'} replace />;
}
function MeetingLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/reunions/${id}` : '/reunions'} replace />;
}
function SessionLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/seances/${id}` : '/seances'} replace />;
}
function ExerciseLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/exercices/${id}` : '/exercices'} replace />;
}
function MatchLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/matchs/${id}` : '/matchs'} replace />;
}

/** Anciens onglets RPE/Bien-être/Médical (anglais) — préservent l'id joueur, renvoient vers le nouveau vocabulaire français (saisie/joueur/equipe). */
function TabLegacyRedirect({ base, newTab }: { base: string; newTab: string }) {
  const { id } = useParams<{ id?: string }>();
  return <Navigate to={id ? `/${base}/${newTab}/${id}` : `/${base}/${newTab}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/connexion',
    lazy: () => import('./pages/LoginPage').then(m => ({ Component: m.default })),
  },
  { path: '/login', element: <Navigate to="/connexion" replace /> },
  {
    path: '/joueur/:playerId/bien-etre',
    lazy: () => import('./pages/PlayerWellnessPublicPage').then(m => ({ Component: m.default })),
  },
  { path: '/player/:playerId/wellness', element: <PlayerWellnessLegacyRedirect /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        Component: Layout,
        children: [
          { index: true, element: <Navigate to="/tableau-de-bord" replace /> },
          { path: 'tableau-de-bord', lazy: () => import('./pages/DashboardPage').then(m => ({ Component: m.default })) },
          { path: 'equipes',         lazy: () => import('./pages/TeamsPage').then(m => ({ Component: m.default })) },
          { path: 'equipes/:id',     lazy: () => import('./pages/TeamsPage').then(m => ({ Component: m.default })) },
          { path: 'joueurs',        lazy: () => import('./pages/PlayersPage').then(m => ({ Component: m.default })) },
          { path: 'rpe',             lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'rpe/:tab',        lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'rpe/:tab/:id',    lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'bien-etre',           lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'bien-etre/:tab',      lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'bien-etre/:tab/:id',  lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'medical',              lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'medical/:tab',        lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'medical/:tab/:id',    lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'taches',         lazy: () => import('./pages/ActionsPage').then(m => ({ Component: m.default })) },
          { path: 'effectif',        lazy: () => import('./pages/RosterPage').then(m => ({ Component: m.default })) },
          { path: 'effectif/:id',    element: <RosterPlayerRedirect /> },
          { path: 'reunions',            lazy: () => import('./pages/MeetingsPage').then(m => ({ Component: m.default })) },
          { path: 'reunions/:id',        lazy: () => import('./pages/MeetingDetailPage').then(m => ({ Component: m.default })) },
          { path: 'presences',      lazy: () => import('./pages/AttendancePage').then(m => ({ Component: m.default })) },
          { path: 'seances',        lazy: () => import('./pages/TrainingSessionsPage').then(m => ({ Component: m.default })) },
          { path: 'seances/:id',    lazy: () => import('./pages/TrainingSessionDetailPage').then(m => ({ Component: m.default })) },
          { path: 'exercices',       lazy: () => import('./pages/ExercisesPage').then(m => ({ Component: m.default })) },
          { path: 'exercices/:id',   lazy: () => import('./pages/ExerciseDetailPage').then(m => ({ Component: m.default })) },
          { path: 'aide',            lazy: () => import('./pages/HelpPage').then(m => ({ Component: m.default })) },
          { path: 'aide/:section',   lazy: () => import('./pages/HelpPage').then(m => ({ Component: m.default })) },
          { path: 'profil',          lazy: () => import('./pages/ProfilePage').then(m => ({ Component: m.default })) },
          // Une section par URL, comme /configuration/:scope/:section. `/profil/notifications`
          // existait déjà comme page autonome : l'URL est conservée, elle sélectionne l'onglet.
          { path: 'profil/:section', lazy: () => import('./pages/ProfilePage').then(m => ({ Component: m.default })) },
          { path: 'notifications/test', lazy: () => import('./pages/PushNotificationTestPage').then(m => ({ Component: m.default })) },
          { path: 'configuration',                  lazy: () => import('./pages/ConfigurationPage').then(m => ({ Component: m.default })) },
          { path: 'configuration/:scope',           lazy: () => import('./pages/ConfigurationPage').then(m => ({ Component: m.default })) },
          { path: 'configuration/:scope/:section',  lazy: () => import('./pages/ConfigurationPage').then(m => ({ Component: m.default })) },
          { path: 'matchs',        lazy: () => import('./pages/MatchesPage').then(m => ({ Component: m.default })) },
          { path: 'matchs/:id',       lazy: () => import('./pages/MatchDetailPage').then(m => ({ Component: m.default })) },
          // Onglet dans l'URL : une fiche match est partageable onglet compris, et une
          // notification d'import tactique peut viser directement la vue concernée.
          { path: 'matchs/:id/:tab',  lazy: () => import('./pages/MatchDetailPage').then(m => ({ Component: m.default })) },
          { path: 'performance-collective',            lazy: () => import('./pages/PerformanceCollectivePage').then(m => ({ Component: m.default })) },
          { path: 'performance-collective/:tab',       lazy: () => import('./pages/PerformanceCollectivePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle',          lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle/:id',      lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle/:id/:tab', lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },

          // ── Anciennes routes — conservées en redirection pour ne pas casser les liens/favoris ──
          { path: 'collective-analyze',     element: <Navigate to="/performance-collective/vue-ensemble" replace /> },
          { path: 'individual-analyze',     element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'individual-analyze/:id', element: <AnalyseIndividuelleRedirect /> },
          { path: 'team-performance',       element: <Navigate to="/performance-collective/vue-ensemble" replace /> },
          { path: 'player-performance',     element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'player-performance/:id', element: <PlayerPerformanceRedirect /> },
          { path: 'cross-analyze',         element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'cross-analyze/:id',     element: <CrossAnalyzeRedirect /> },

          // ── Anciens chemins en anglais — renommés en français (voir audit navigation) ──
          { path: 'dashboard',       element: <Navigate to="/tableau-de-bord" replace /> },
          { path: 'roster',          element: <Navigate to="/effectif" replace /> },
          { path: 'teams',           element: <Navigate to="/equipes" replace /> },
          { path: 'teams/:id',       element: <TeamLegacyRedirect /> },
          { path: 'players',         element: <Navigate to="/joueurs" replace /> },
          { path: 'actions',         element: <Navigate to="/taches" replace /> },
          { path: 'meetings',        element: <Navigate to="/reunions" replace /> },
          { path: 'meetings/:id',    element: <MeetingLegacyRedirect /> },
          { path: 'attendance',      element: <Navigate to="/presences" replace /> },
          { path: 'sessions',        element: <Navigate to="/seances" replace /> },
          { path: 'sessions/:id',    element: <SessionLegacyRedirect /> },
          { path: 'exercises',       element: <Navigate to="/exercices" replace /> },
          { path: 'exercises/:id',   element: <ExerciseLegacyRedirect /> },
          { path: 'profile',                element: <Navigate to="/profil" replace /> },
          { path: 'profile/notifications',  element: <Navigate to="/profil/notifications" replace /> },
          { path: 'matches',         element: <Navigate to="/matchs" replace /> },
          { path: 'matches/:id',     element: <MatchLegacyRedirect /> },
          { path: 'wellness',            element: <Navigate to="/bien-etre" replace /> },
          { path: 'wellness/new',        element: <Navigate to="/bien-etre/saisie" replace /> },
          { path: 'wellness/new/:id',    element: <TabLegacyRedirect base="bien-etre" newTab="saisie" /> },
          { path: 'wellness/individual', element: <Navigate to="/bien-etre/joueur" replace /> },
          { path: 'wellness/individual/:id', element: <TabLegacyRedirect base="bien-etre" newTab="joueur" /> },
          { path: 'wellness/team',       element: <Navigate to="/bien-etre/equipe" replace /> },
          { path: 'wellness/team/:id',   element: <TabLegacyRedirect base="bien-etre" newTab="equipe" /> },
          { path: 'rpe/new',        element: <Navigate to="/rpe/saisie" replace /> },
          { path: 'rpe/new/:id',    element: <TabLegacyRedirect base="rpe" newTab="saisie" /> },
          { path: 'rpe/individual', element: <Navigate to="/rpe/joueur" replace /> },
          { path: 'rpe/individual/:id', element: <TabLegacyRedirect base="rpe" newTab="joueur" /> },
          { path: 'rpe/team',       element: <Navigate to="/rpe/equipe" replace /> },
          { path: 'rpe/team/:id',   element: <TabLegacyRedirect base="rpe" newTab="equipe" /> },
          { path: 'medical/infirmary',     element: <Navigate to="/medical/infirmerie" replace /> },
          { path: 'medical/infirmary/:id', element: <TabLegacyRedirect base="medical" newTab="infirmerie" /> },
          { path: 'medical/record',        element: <Navigate to="/medical/joueur" replace /> },
          { path: 'medical/record/:id',    element: <TabLegacyRedirect base="medical" newTab="joueur" /> },
          { path: 'medical/team',          element: <Navigate to="/medical/equipe" replace /> },
          { path: 'medical/team/:id',      element: <TabLegacyRedirect base="medical" newTab="equipe" /> },

          { path: '*', element: <Navigate to="/tableau-de-bord" replace /> },
        ],
      },
    ],
  },
]);
