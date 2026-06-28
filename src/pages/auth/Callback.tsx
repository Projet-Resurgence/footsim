import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDiscordUser, parseTokenFragment, isAdminId } from '@/lib/auth/discord';
import { useSession } from '@/stores/session';
import { usePrApiToken } from '@/stores/prApiToken';
import { prapi } from '@/lib/prapi/client';
import { GithubTeamBackend } from '@/lib/github/backend';
import { env } from '@/lib/env';
import { Spinner } from '@/components/ui/Spinner';

export default function Callback() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const setToken = usePrApiToken((s) => s.setToken);
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

        // Exchange Discord token for PR_API FootSim JWT
        try {
          const result = await prapi.exchangeDiscordToken(parsed.accessToken);
          setToken(result.token, result.is_admin);
        } catch {
          // Non-fatal — falls back to GitHub / IndexedDB backends
        }

        if (isAdminId(user.id)) {
          navigate('/dashboard', { replace: true });
          return;
        }

        // Check if user is a team manager (via GitHub read token if configured)
        if (env.githubReadToken) {
          const ghBackend = new GithubTeamBackend(env.githubReadToken);
          const teams = await ghBackend.listTeams(user.id);
          const isManager = teams.some((t) => t.managerDiscordId === user.id);
          navigate(isManager ? '/my-team' : '/no-access', { replace: true });
        } else {
          navigate('/no-access', { replace: true });
        }
      })
      .catch((err) => setError(String(err)));
  }, [navigate, setSession, setToken]);

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
