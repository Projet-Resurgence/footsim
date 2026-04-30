import { createBrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';
import Callback from '@/pages/auth/Callback';
import NoAccess from '@/pages/NoAccess';
import Dashboard from '@/pages/dashboard/Dashboard';
import Settings from '@/pages/dashboard/Settings';
import Teams from '@/pages/dashboard/Teams';
import TeamNew from '@/pages/dashboard/TeamNew';
import TeamDetail from '@/pages/dashboard/TeamDetail';
import Simulation from '@/pages/dashboard/Simulation';
import MatchSetup from '@/pages/matches/MatchSetup';
import MatchLive from '@/pages/matches/MatchLive';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAdmin } from '@/components/auth/RequireAdmin';

export const router = createBrowserRouter(
  [
    { path: '/', element: <Home /> },
    { path: '/auth/callback', element: <Callback /> },
    { path: '/no-access', element: <NoAccess /> },
    {
      path: '/dashboard',
      element: (
        <RequireAdmin>
          <DashboardLayout />
        </RequireAdmin>
      ),
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'teams', element: <Teams /> },
        { path: 'teams/new', element: <TeamNew /> },
        { path: 'teams/:slug', element: <TeamDetail /> },
        { path: 'settings', element: <Settings /> },
        { path: 'simulation', element: <Simulation /> },
      ],
    },
    {
      path: '/match',
      element: (
        <RequireAdmin>
          <MatchSetup />
        </RequireAdmin>
      ),
    },
    {
      path: '/match/:id',
      element: (
        <RequireAdmin>
          <MatchLive />
        </RequireAdmin>
      ),
    },
  ],
  { basename: '/footsim' },
);
