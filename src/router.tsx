import { createBrowserRouter, Navigate, useParams } from 'react-router';

function RedirectToAnalyse() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/individual-analyze/${id}`} replace />;
}

import { Layout }      from './layout/Layout';
import { RequireAuth } from './components';

import LoginPage         from './pages/LoginPage';
import DashboardPage     from './pages/DashboardPage';
import TeamsPage         from './pages/TeamsPage';
import PlayersPage       from './pages/PlayersPage';
import RPEPage           from './pages/RPEPage';
import WellnessPage      from './pages/WellnessPage';
import MedicalPage       from './pages/MedicalPage';
import ActionsPage       from './pages/ActionsPage';
import StatsPage         from './pages/StatsPage';
import PlayerReportPage  from './pages/PlayerReportPage';
import TeamReportPage    from './pages/TeamReportPage';
import RosterPage        from './pages/RosterPage';
import MeetingsPage      from './pages/MeetingsPage';
import AttendancePage    from './pages/AttendancePage';
import ProfilePage       from './pages/ProfilePage';
import PlayerRPEPage               from './pages/PlayerRPEPage';
import TrainingSessionsPage        from './pages/TrainingSessionsPage';
import TrainingSessionDetailPage   from './pages/TrainingSessionDetailPage';
import MeetingDetailPage           from './pages/MeetingDetailPage';
import ExercisesPage               from './pages/ExercisesPage';
import ExerciseDetailPage          from './pages/ExerciseDetailPage';
import ConfigurationPage           from './pages/ConfigurationPage';
import PlayerWellnessPublicPage    from './pages/PlayerWellnessPublicPage';
import MatchesPage                 from './pages/MatchesPage';
import MatchDetailPage             from './pages/MatchDetailPage';
import AnalyseCollectivePage       from './pages/AnalyseCollectivePage';
import AnalyseIndividuellePage     from './pages/AnalyseIndividuellePage';
import AnalyseCroiseePage          from './pages/AnalyseCroiseePage';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/player/:playerId/wellness',
    Component: PlayerWellnessPublicPage,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        Component: Layout,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard',      Component: DashboardPage    },
          { path: 'teams',           Component: TeamsPage        },
          { path: 'teams/:id',      Component: TeamsPage        },
          { path: 'players',           Component: PlayersPage      },
          { path: 'players/:id',     element: <RedirectToAnalyse /> },
          { path: 'players/:id/rpe', Component: PlayerRPEPage    },
          { path: 'rpe',             Component: RPEPage          },
          { path: 'rpe/:tab',        Component: RPEPage          },
          { path: 'rpe/:tab/:id',    Component: RPEPage          },
          { path: 'wellness',           Component: WellnessPage     },
          { path: 'wellness/:tab',      Component: WellnessPage     },
          { path: 'wellness/:tab/:id',  Component: WellnessPage     },
          { path: 'medical',              Component: MedicalPage      },
          { path: 'medical/:tab',        Component: MedicalPage      },
          { path: 'medical/:tab/:id',    Component: MedicalPage      },
          { path: 'actions',        Component: ActionsPage      },
          { path: 'stats',          Component: StatsPage        },
          { path: 'stats/:id',      Component: StatsPage        },
          { path: 'roster',          Component: RosterPage       },
          { path: 'meetings',            Component: MeetingsPage       },
          { path: 'meetings/:id',        Component: MeetingDetailPage  },
          { path: 'attendance',      Component: AttendancePage   },
          { path: 'sessions',        Component: TrainingSessionsPage      },
          { path: 'sessions/:id',    Component: TrainingSessionDetailPage },
          { path: 'exercises',       Component: ExercisesPage             },
          { path: 'exercises/:id',   Component: ExerciseDetailPage        },
          { path: 'profile',         Component: ProfilePage      },
          { path: 'configuration',  Component: ConfigurationPage },
          { path: 'matches',        Component: MatchesPage      },
          { path: 'matches/:id',   Component: MatchDetailPage  },
          { path: 'reports/player', Component: PlayerReportPage },
          { path: 'reports/team',   Component: TeamReportPage   },
          { path: 'collective-analyze',      Component: AnalyseCollectivePage   },
          { path: 'individual-analyze',    Component: AnalyseIndividuellePage },
          { path: 'individual-analyze/:id', Component: AnalyseIndividuellePage },
          { path: 'cross-analyze',         Component: AnalyseCroiseePage },
          { path: 'cross-analyze/:id',     Component: AnalyseCroiseePage },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
