import { createBrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';
import Callback from '@/pages/auth/Callback';
import NoAccess from '@/pages/NoAccess';
import MyTeam from '@/pages/MyTeam';
import Dashboard from '@/pages/dashboard/Dashboard';
import Settings from '@/pages/dashboard/Settings';
import Teams from '@/pages/dashboard/Teams';
import TeamNew from '@/pages/dashboard/TeamNew';
import TeamDetail from '@/pages/dashboard/TeamDetail';
import Simulation from '@/pages/dashboard/Simulation';
import Postes from '@/pages/dashboard/Postes';
import NotesJoueurs from '@/pages/dashboard/NotesJoueurs';
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
        { path: 'teams/:slug/leagues/new', element: <LeagueNew /> },
        { path: 'leagues/:leagueId', element: <LeagueDetail /> },
        { path: 'leagues/:leagueId/divisions/:divisionId/clubs/new', element: <ClubNew /> },
        { path: 'settings', element: <Settings /> },
        { path: 'simulation', element: <Simulation /> },
        { path: 'competitions', element: <Competitions /> },
        { path: 'competitions/new', element: <CompetitionNew /> },
        { path: 'competitions/:id', element: <CompetitionDetail /> },
        { path: 'postes', element: <Postes /> },
        { path: 'notes-joueurs', element: <NotesJoueurs /> },
      ],
    },
    {
      path: '/my-team',
      element: (
        <RequireAuth>
          <MyTeam />
        </RequireAuth>
      ),
    },
    {
      path: '/competition-view/:id',
      element: (
        <RequireAuth>
          <CompetitionDetail />
        </RequireAuth>
      ),
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
    {
      path: '/competition/:competitionId/match/:matchId',
      element: (
        <RequireAdmin>
          <CompetitionMatchLive />
        </RequireAdmin>
      ),
    },
    {
      path: '/competition/:competitionId/round/:round',
      element: (
        <RequireAdmin>
          <MultiplexLive />
        </RequireAdmin>
      ),
    },
  ],
  { basename: '/' },
);
