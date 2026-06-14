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
import Postes from '@/pages/dashboard/Postes';
import Competitions from '@/pages/dashboard/Competitions';
import CompetitionNew from '@/pages/dashboard/CompetitionNew';
import CompetitionDetail from '@/pages/dashboard/CompetitionDetail';
import LeagueNew from '@/pages/dashboard/LeagueNew';
import LeagueDetail from '@/pages/dashboard/LeagueDetail';
import ClubNew from '@/pages/dashboard/ClubNew';
import MatchSetup from '@/pages/matches/MatchSetup';
import MatchLive from '@/pages/matches/MatchLive';
import CompetitionMatchLive from '@/pages/matches/CompetitionMatchLive';
import MultiplexLive from '@/pages/matches/MultiplexLive';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAuth } from '@/components/auth/RequireAuth';

export const router = createBrowserRouter(
  [
    { path: '/', element: <Home /> },
    { path: '/auth/callback', element: <Callback /> },
    { path: '/no-access', element: <NoAccess /> },
    {
      path: '/dashboard',
      element: (
        <RequireAuth>
          <DashboardLayout />
        </RequireAuth>
      ),
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'teams', element: <Teams /> },
        { path: 'teams/new', element: <TeamNew /> },
        { path: 'teams/:slug', element: <TeamDetail /> },
        { path: 'teams/:slug/leagues/new', element: <LeagueNew /> },
        { path: 'leagues/:leagueId', element: <LeagueDetail /> },
        { path: 'leagues/:leagueId/divisions/:divisionId/clubs/new', element: <ClubNew /> },
        { path: 'settings', element: <Settings /> },
        { path: 'simulation', element: <Simulation /> },
        { path: 'competitions', element: <Competitions /> },
        { path: 'competitions/new', element: <CompetitionNew /> },
        { path: 'competitions/:id', element: <CompetitionDetail /> },
        { path: 'postes', element: <Postes /> },
      ],
    },
    {
      path: '/match',
      element: (
        <RequireAuth>
          <MatchSetup />
        </RequireAuth>
      ),
    },
    {
      path: '/match/:id',
      element: (
        <RequireAuth>
          <MatchLive />
        </RequireAuth>
      ),
    },
    {
      path: '/competition/:competitionId/match/:matchId',
      element: (
        <RequireAuth>
          <CompetitionMatchLive />
        </RequireAuth>
      ),
    },
    {
      path: '/competition/:competitionId/round/:round',
      element: (
        <RequireAuth>
          <MultiplexLive />
        </RequireAuth>
      ),
    },
  ],
  { basename: '/footsim' },
);
