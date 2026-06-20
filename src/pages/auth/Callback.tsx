import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDiscordUser, parseTokenFragment, isAdminId } from '@/lib/auth/discord';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';
import { Spinner } from '@/components/ui/Spinner';

export default function Callback() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const refreshTeams = useTeams((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseTokenFragment(window.location.hash);
    if (!parsed) {
      setError('Token Discord absent.');
      return;
    }
    fetchDiscordUser(parsed.accessToken)
      .then(async (user) => {
        setSession({
          id: user.id,
          username: user.global_name ?? user.username,
          avatar: user.avatar,
          accessToken: parsed.accessToken,
          expiresAt: Date.now() + parsed.expiresIn * 1000,
        });
        if (isAdminId(user.id)) {
          navigate('/dashboard', { replace: true });
          return;
        }
        // Check if user is a team manager
        await refreshTeams(user.id, null);
        const teams = useTeams.getState().teams;
        const isManager = teams.some((t) => t.managerDiscordId === user.id);
        navigate(isManager ? '/my-team' : '/no-access', { replace: true });
      })
      .catch((err) => setError(String(err)));
  }, [navigate, setSession, refreshTeams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      {error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : (
        <>
          <Spinner className="h-6 w-6" />
          <p className="text-muted text-sm">Connexion à Discord…</p>
        </>
      )}
    </main>
  );
}
