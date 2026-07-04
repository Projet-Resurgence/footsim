import { NavLink, Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';
import { NAV_ICON, IconDot } from './NavIcons';

export type NavItem = { to: string; label: string; end?: boolean; adminOnly?: boolean; nonAdminOnly?: boolean };
export const navItems: NavItem[] = [
  { to: '/my-team', label: 'Mon équipe', end: true },
  { to: '/dashboard', label: "Vue d'ensemble", end: true, adminOnly: true },
  { to: '/dashboard/teams', label: 'Équipes', adminOnly: true },
  { to: '/dashboard/competitions', label: 'Compétitions', adminOnly: true },
  { to: '/competitions', label: 'Compétitions', nonAdminOnly: true },
  { to: '/play', label: 'Jouer un match', nonAdminOnly: true },
  { to: '/match', label: 'Jouer un match', adminOnly: true },
  { to: '/my-team/classements-cmf', label: 'Classements CMF' },
  { to: '/my-team/simulation', label: 'Simulation' },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

function Brand() {
  return (
    <Link to="/" className="mb-8 flex items-center gap-2.5 px-2 group">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5 8 10.4l1.5 4.6h5L16 10.4 12 7.5ZM12 3v4.5M4 9.5l4 .9M20 9.5l-4 .9M6.5 19.5l3-4.5M17.5 19.5l-3-4.5" />
        </svg>
      </span>
      <span className="font-display text-2xl leading-none">
        Foot<span className="text-accent">Sim</span>
      </span>
    </Link>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const isAdmin = useSession((s) => s.isAdmin());
  const filtered = navItems.filter((item) => (!item.adminOnly || isAdmin) && (!item.nonAdminOnly || !isAdmin));

  const nav = (
    <>
      <Brand />
      <nav className="flex flex-col gap-1">
        {filtered.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text/75 hover:bg-border/40 hover:text-text',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                )}
                <span className="shrink-0 opacity-90">{NAV_ICON[item.to] ?? <IconDot />}</span>
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-2 pt-6 text-[11px] text-muted/60">
        Projet Résurgence · {new Date().getFullYear()}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
        {nav}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
          {/* drawer */}
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-surface px-4 py-6 shadow-2xl flex flex-col rounded-r-2xl">
            <button
              onClick={onClose}
              className="self-end mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-border/40 transition-colors"
              aria-label="Fermer le menu"
            >
              ✕
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
