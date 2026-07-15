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

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('./pages/LoginPage').then(m => ({ Component: m.default })),
  },
  {
    path: '/player/:playerId/wellness',
    lazy: () => import('./pages/PlayerWellnessPublicPage').then(m => ({ Component: m.default })),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        Component: Layout,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard',      lazy: () => import('./pages/DashboardPage').then(m => ({ Component: m.default })) },
          { path: 'teams',          lazy: () => import('./pages/TeamsPage').then(m => ({ Component: m.default })) },
          { path: 'teams/:id',      lazy: () => import('./pages/TeamsPage').then(m => ({ Component: m.default })) },
          { path: 'players',        lazy: () => import('./pages/PlayersPage').then(m => ({ Component: m.default })) },
          { path: 'rpe',             lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'rpe/:tab',        lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'rpe/:tab/:id',    lazy: () => import('./pages/RPEPage').then(m => ({ Component: m.default })) },
          { path: 'wellness',           lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'wellness/:tab',      lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'wellness/:tab/:id',  lazy: () => import('./pages/WellnessPage').then(m => ({ Component: m.default })) },
          { path: 'medical',              lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'medical/:tab',        lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'medical/:tab/:id',    lazy: () => import('./pages/MedicalPage').then(m => ({ Component: m.default })) },
          { path: 'actions',        lazy: () => import('./pages/ActionsPage').then(m => ({ Component: m.default })) },
          { path: 'roster',          lazy: () => import('./pages/RosterPage').then(m => ({ Component: m.default })) },
          { path: 'roster/:id',      element: <RosterPlayerRedirect /> },
          { path: 'meetings',            lazy: () => import('./pages/MeetingsPage').then(m => ({ Component: m.default })) },
          { path: 'meetings/:id',        lazy: () => import('./pages/MeetingDetailPage').then(m => ({ Component: m.default })) },
          { path: 'attendance',      lazy: () => import('./pages/AttendancePage').then(m => ({ Component: m.default })) },
          { path: 'sessions',        lazy: () => import('./pages/TrainingSessionsPage').then(m => ({ Component: m.default })) },
          { path: 'sessions/:id',    lazy: () => import('./pages/TrainingSessionDetailPage').then(m => ({ Component: m.default })) },
          { path: 'exercises',       lazy: () => import('./pages/ExercisesPage').then(m => ({ Component: m.default })) },
          { path: 'exercises/:id',   lazy: () => import('./pages/ExerciseDetailPage').then(m => ({ Component: m.default })) },
          { path: 'profile',         lazy: () => import('./pages/ProfilePage').then(m => ({ Component: m.default })) },
          { path: 'configuration',  lazy: () => import('./pages/ConfigurationPage').then(m => ({ Component: m.default })) },
          { path: 'matches',        lazy: () => import('./pages/MatchesPage').then(m => ({ Component: m.default })) },
          { path: 'matches/:id',   lazy: () => import('./pages/MatchDetailPage').then(m => ({ Component: m.default })) },
          { path: 'performance-collective',            lazy: () => import('./pages/PerformanceCollectivePage').then(m => ({ Component: m.default })) },
          { path: 'performance-collective/:tab',       lazy: () => import('./pages/PerformanceCollectivePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle',          lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle/:id',      lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'performance-individuelle/:id/:tab', lazy: () => import('./pages/PerformanceIndividuellePage').then(m => ({ Component: m.default })) },
          // Anciennes routes Analyse/Performance — conservées en redirection pour ne pas casser les liens/favoris
          { path: 'collective-analyze',     element: <Navigate to="/performance-collective/vue-ensemble" replace /> },
          { path: 'individual-analyze',     element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'individual-analyze/:id', element: <AnalyseIndividuelleRedirect /> },
          { path: 'team-performance',       element: <Navigate to="/performance-collective/vue-ensemble" replace /> },
          { path: 'player-performance',     element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'player-performance/:id', element: <PlayerPerformanceRedirect /> },
          { path: 'cross-analyze',         element: <Navigate to="/performance-individuelle" replace /> },
          { path: 'cross-analyze/:id',     element: <CrossAnalyzeRedirect /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
