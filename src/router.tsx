import { createBrowserRouter, Navigate, useParams } from 'react-router';

import { Layout }      from './layout/Layout';
import { RequireAuth } from './components';

/** Ancienne route /cross-analyze/:id — redirige vers la page Performance joueuse */
function CrossAnalyzeRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/player-performance/${id}` : '/player-performance'} replace />;
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
          {
            path: 'players/:id',
            lazy: () => import('./pages/PlayersPage').then(m => ({
              Component: function PlayerProfileRoute() {
                const { id } = useParams<{ id: string }>();
                if (!id) return null;
                return <m.PlayerProfile playerId={id} />;
              },
            })),
          },
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
          { path: 'roster/:id',      lazy: () => import('./pages/PlayerHubPage').then(m => ({ Component: m.default })) },
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
          { path: 'collective-analyze',      lazy: () => import('./pages/AnalyseCollectivePage').then(m => ({ Component: m.default })) },
          { path: 'individual-analyze',    lazy: () => import('./pages/AnalyseIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'individual-analyze/:id', lazy: () => import('./pages/AnalyseIndividuellePage').then(m => ({ Component: m.default })) },
          { path: 'team-performance',        lazy: () => import('./pages/PerformancePage').then(m => ({ Component: m.default })) },
          { path: 'player-performance',      lazy: () => import('./pages/PerformancePage').then(m => ({ Component: m.PerformancePlayerPage })) },
          { path: 'player-performance/:id',  lazy: () => import('./pages/PerformancePage').then(m => ({ Component: m.PerformancePlayerPage })) },
          { path: 'cross-analyze',         element: <Navigate to="/player-performance" replace /> },
          { path: 'cross-analyze/:id',     element: <CrossAnalyzeRedirect /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
