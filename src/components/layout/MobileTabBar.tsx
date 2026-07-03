import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';
import { navItems } from './Sidebar';

const ICON: Record<string, JSX.Element> = {
  '/my-team': <IconShield />,
  '/dashboard': <IconHome />,
  '/dashboard/teams': <IconUsers />,
  '/dashboard/competitions': <IconTrophy />,
  '/competitions': <IconTrophy />,
  '/play': <IconBall />,
  '/match': <IconBall />,
  '/my-team/classements-cmf': <IconRanking />,
  '/my-team/simulation': <IconChart />,
};

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

/**
 * Barre d'onglets mobile (façon app native) — les 5 destinations principales.
 * Le tiroir latéral reste accessible pour le reste.
 */
export function MobileTabBar() {
  const isAdmin = useSession((s) => s.isAdmin());
  const filtered = navItems
    .filter((item) => (!item.adminOnly || isAdmin) && (!item.nonAdminOnly || !isAdmin))
    .slice(0, 5);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-center border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {filtered.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              // largeur bornée par onglet (pas de flex-1) : quel que soit le nombre
              // d'onglets, ils restent groupés et centrés — plus d'étirement plein largeur
              'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-w-0 basis-20 max-w-[22%] grow-0',
              isActive ? 'text-accent' : 'text-muted hover:text-text',
            )
          }
        >
          <span className="h-5 w-5">{ICON[item.to] ?? <IconDot />}</span>
          <span className="truncate max-w-full px-0.5">{SHORT_LABEL[item.to] ?? item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

const P = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'h-5 w-5',
};

function IconHome() {
  return <svg {...P}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function IconShield() {
  return <svg {...P}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /></svg>;
}
function IconUsers() {
  return <svg {...P}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.7-3 3-4.5 5.5-4.5s4.8 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 15.7c2.3.2 4.3 1.5 5 4.3" /></svg>;
}
function IconTrophy() {
  return <svg {...P}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 5H5a3 3 0 0 0 3 4.5M16 5h3a3 3 0 0 1-3 4.5" /><path d="M12 13v4m-4 4h8m-6.5 0v-2.5a2 2 0 0 1 5 0V21" /></svg>;
}
function IconBall() {
  return <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7.5 8 10.4l1.5 4.6h5L16 10.4 12 7.5ZM12 3v4.5M4 9.5l4 .9M20 9.5l-4 .9M6.5 19.5l3-4.5M17.5 19.5l-3-4.5" /></svg>;
}
function IconRanking() {
  return <svg {...P}><path d="M4 20V10m8 10V4m8 16v-7" /></svg>;
}
function IconChart() {
  return <svg {...P}><path d="M4 20h16M4 20V6m0 14 5-6 4 3 7-8" /></svg>;
}
function IconDot() {
  return <svg {...P}><circle cx="12" cy="12" r="2.5" /></svg>;
}
