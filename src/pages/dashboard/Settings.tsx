import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/stores/session';

export default function Settings() {
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);
  const isAdmin = useSession((s) => s.isAdmin());
  const navigate = useNavigate();

  function disconnect() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="mb-6 font-display text-3xl sm:text-4xl">Réglages</h1>
      </div>

      {/* Profil Discord */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          {session?.avatar ? (
            <img
              alt=""
              src={`https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=64`}
              className="h-12 w-12 rounded-full border border-border"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-border" />
          )}
          <div>
            <div className="font-medium">{session?.username}</div>
            <div className="text-xs text-muted">Discord ID {session?.id}</div>
            {isAdmin && <div className="text-xs text-accent">Administrateur</div>}
          </div>
        </div>
        <Button variant="ghost" onClick={disconnect}>
          Se déconnecter
        </Button>
      </section>
    </div>
  );
}
