import { createBrowserRouter, Navigate } from 'react-router';

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
import StaffPage         from './pages/StaffPage';
import ProfilePage       from './pages/ProfilePage';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
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
          { path: 'teams',          Component: TeamsPage        },
          { path: 'players',        Component: PlayersPage      },
          { path: 'players/:id',    Component: PlayersPage      },
          { path: 'rpe',            Component: RPEPage          },
          { path: 'wellness',       Component: WellnessPage     },
          { path: 'medical',        Component: MedicalPage      },
          { path: 'actions',        Component: ActionsPage      },
          { path: 'stats',          Component: StatsPage        },
          { path: 'stats/:id',      Component: StatsPage        },
          { path: 'roster',          Component: RosterPage       },
          { path: 'staff',           Component: StaffPage        },
          { path: 'profile',         Component: ProfilePage      },
          { path: 'reports/player', Component: PlayerReportPage },
          { path: 'reports/team',   Component: TeamReportPage   },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
