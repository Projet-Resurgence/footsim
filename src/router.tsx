import { createBrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';
import Callback from '@/pages/auth/Callback';
import NoAccess from '@/pages/NoAccess';
import Dashboard from '@/pages/dashboard/Dashboard';
import Settings from '@/pages/dashboard/Settings';
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
        { path: 'settings', element: <Settings /> },
      ],
    },
  ],
  { basename: '/footsim' },
);
