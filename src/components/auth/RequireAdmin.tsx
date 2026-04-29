import { Navigate } from 'react-router-dom';
import { useSession } from '@/stores/session';
import type { ReactNode } from 'react';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useSession((s) => s.isAdmin());
  const isLoggedIn = useSession((s) => s.isLoggedIn());
  if (!isLoggedIn) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}
