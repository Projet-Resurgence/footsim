import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';
import { navItems } from './Sidebar';
import { NAV_ICON, IconDot } from './NavIcons';

/** Libellés courts pour la barre mobile */
const SHORT_LABEL: Record<string, string> = {
  '/my-team': 'Équipe',
  '/dashboard': 'Accueil',
  '/dashboard/teams': 'Équipes',
  '/dashboard/competitions': 'Compéts',
  '/competitions': 'Compéts',
  '/play': 'Match',
  '/match': 'Match',
  '/my-team/classements-cmf': 'CMF',
  '/my-team/simulation': 'Simu',
};

/** Destination « action » mise en avant au centre de la barre (bouton dédié mobile). */
const CENTER_ACTION = new Set(['/play', '/match']);

/**
 * Barre d'onglets mobile (façon app native) — les 5 destinations principales.
 * Le bouton « Match » est surélevé au centre, comme une action primaire dédiée.
 * Le tiroir latéral reste accessible pour le reste.
 */
export function MobileTabBar() {
  const isAdmin = useSession((s) => s.isAdmin());
  const filtered = navItems
    .filter((item) => (!item.adminOnly || isAdmin) && (!item.nonAdminOnly || !isAdmin))
    .slice(0, 5);

  // Place l'action « Match » au centre de la barre
  const action = filtered.find((i) => CENTER_ACTION.has(i.to));
  const rest = filtered.filter((i) => !CENTER_ACTION.has(i.to));
  const ordered = action
    ? [...rest.slice(0, 2), action, ...rest.slice(2)]
    : filtered;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-center border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {ordered.map((item) => {
        const isCenter = CENTER_ACTION.has(item.to);
        if (isCenter) {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="relative flex flex-col items-center justify-end pb-1.5 pt-0 min-w-0 flex-1 max-w-24"
              aria-label={SHORT_LABEL[item.to] ?? item.label}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      '-mt-5 flex h-12 w-12 items-center justify-center rounded-full text-on-accent shadow-lg transition-transform active:scale-95',
                      isActive ? 'bg-accent shadow-accent/40' : 'bg-accent/90 shadow-accent/25',
                    )}
                  >
                    {NAV_ICON[item.to] ?? <IconDot />}
                  </span>
                  <span className={cn('mt-0.5 text-[10px] font-medium truncate max-w-full px-0.5', isActive ? 'text-accent' : 'text-muted')}>
                    {SHORT_LABEL[item.to] ?? item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        }
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                // flex-1 borné : les onglets se partagent la largeur disponible
                // sans jamais déborder de l'écran (5 onglets max)
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-w-0 flex-1 max-w-24',
                isActive ? 'text-accent' : 'text-muted hover:text-text',
              )
            }
          >
            <span className="h-5 w-5">{NAV_ICON[item.to] ?? <IconDot />}</span>
            <span className="truncate max-w-full px-0.5">{SHORT_LABEL[item.to] ?? item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
