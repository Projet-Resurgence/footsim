import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Home from '@/pages/Home';
import Callback from '@/pages/auth/Callback';
import NoAccess from '@/pages/NoAccess';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireAdmin } from '@/components/auth/RequireAdmin';
import { Spinner } from '@/components/ui/Spinner';

function lazyWithReload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err) => {
      // Stale chunk after a new deploy — hard reload once to get fresh assets
      const reloaded = sessionStorage.getItem('footsim.chunk_reload');
      if (!reloaded) {
        sessionStorage.setItem('footsim.chunk_reload', '1');
        window.location.reload();
      }
      return Promise.reject(err);
    }),
  );
}

const MyTeam = lazyWithReload(() => import('@/pages/MyTeam'));
const Dashboard = lazyWithReload(() => import('@/pages/dashboard/Dashboard'));
const Settings = lazyWithReload(() => import('@/pages/dashboard/Settings'));
const Teams = lazyWithReload(() => import('@/pages/dashboard/Teams'));
const TeamNew = lazyWithReload(() => import('@/pages/dashboard/TeamNew'));
const TeamDetail = lazyWithReload(() => import('@/pages/dashboard/TeamDetail'));
const Simulation = lazyWithReload(() => import('@/pages/dashboard/Simulation'));
const Postes = lazyWithReload(() => import('@/pages/dashboard/Postes'));
const NotesJoueurs = lazyWithReload(() => import('@/pages/dashboard/NotesJoueurs'));
const MeilleursJoueurs = lazyWithReload(() => import('@/pages/dashboard/MeilleursJoueurs'));
const Competitions = lazyWithReload(() => import('@/pages/dashboard/Competitions'));
const CompetitionNew = lazyWithReload(() => import('@/pages/dashboard/CompetitionNew'));
const CompetitionDetail = lazyWithReload(() => import('@/pages/dashboard/CompetitionDetail'));
const LeagueNew = lazyWithReload(() => import('@/pages/dashboard/LeagueNew'));
const LeagueDetail = lazyWithReload(() => import('@/pages/dashboard/LeagueDetail'));
const ClubNew = lazyWithReload(() => import('@/pages/dashboard/ClubNew'));
const MatchSetup = lazyWithReload(() => import('@/pages/matches/MatchSetup'));
const MatchLive = lazyWithReload(() => import('@/pages/matches/MatchLive'));
const CompetitionMatchLive = lazyWithReload(() => import('@/pages/matches/CompetitionMatchLive'));
const MultiplexLive = lazyWithReload(() => import('@/pages/matches/MultiplexLive'));

function PageFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

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
        { index: true, element: <S><Dashboard /></S> },
        { path: 'teams', element: <S><Teams /></S> },
        { path: 'teams/new', element: <S><TeamNew /></S> },
        { path: 'teams/:slug', element: <S><TeamDetail /></S> },
        { path: 'teams/:slug/leagues/new', element: <S><LeagueNew /></S> },
        { path: 'leagues/:leagueId', element: <S><LeagueDetail /></S> },
        { path: 'leagues/:leagueId/divisions/:divisionId/clubs/new', element: <S><ClubNew /></S> },
        { path: 'settings', element: <S><Settings /></S> },
        { path: 'simulation', element: <S><Simulation /></S> },
        { path: 'competitions', element: <S><Competitions /></S> },
        { path: 'competitions/new', element: <S><CompetitionNew /></S> },
        { path: 'competitions/:id', element: <S><CompetitionDetail /></S> },
        { path: 'postes', element: <S><Postes /></S> },
        { path: 'notes-joueurs', element: <S><NotesJoueurs /></S> },
        { path: 'meilleurs-joueurs', element: <S><MeilleursJoueurs /></S> },
      ],
    },
    {
      path: '/my-team',
      element: (
        <RequireAuth>
          <S><MyTeam /></S>
        </RequireAuth>
      ),
    },
    {
      path: '/competition-view/:id',
      element: (
        <RequireAuth>
          <S><CompetitionDetail /></S>
        </RequireAuth>
      ),
    },
    {
      path: '/match',
      element: (
        <RequireAdmin>
          <S><MatchSetup /></S>
        </RequireAdmin>
      ),
    },
    {
      path: '/match/:id',
      element: (
        <RequireAdmin>
          <S><MatchLive /></S>
        </RequireAdmin>
      ),
    },
    {
      path: '/competition/:competitionId/match/:matchId',
      element: (
        <RequireAdmin>
          <S><CompetitionMatchLive /></S>
        </RequireAdmin>
      ),
    },
    {
      path: '/competition/:competitionId/round/:round',
      element: (
        <RequireAdmin>
          <S><MultiplexLive /></S>
        </RequireAdmin>
      ),
    },
  ],
  { basename: '/' },
);
