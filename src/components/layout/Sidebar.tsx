import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';

type NavItem = { to: string; label: string; end?: boolean; adminOnly?: boolean; nonAdminOnly?: boolean };
const items: NavItem[] = [
  { to: '/my-team', label: 'Mon équipe', end: true },
  { to: '/dashboard', label: "Vue d'ensemble", end: true, adminOnly: true },
  { to: '/dashboard/teams', label: 'Équipes', adminOnly: true },
  { to: '/dashboard/competitions', label: 'Compétitions', adminOnly: true },
  { to: '/competitions', label: 'Compétitions', nonAdminOnly: true },
  { to: '/play', label: 'Jouer un match', nonAdminOnly: true },
  { to: '/match', label: 'Matchs', adminOnly: true },
  { to: '/my-team/classements-cmf', label: 'Classements CMF' },
  { to: '/my-team/simulation', label: 'Simulation' },
];

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const isAdmin = useSession((s) => s.isAdmin());
  const filtered = items.filter((item) => (!item.adminOnly || isAdmin) && (!item.nonAdminOnly || !isAdmin));

  const nav = (
    <>
      <div className="mb-10 px-2 font-display text-2xl">FootSim</div>
      <nav className="flex flex-col gap-1">
        {filtered.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-accent/10 text-accent' : 'text-text/80 hover:bg-border/40',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
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
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          {/* drawer */}
          <aside className="absolute left-0 top-0 h-full w-64 bg-surface px-4 py-6 shadow-xl flex flex-col">
            <button
              onClick={onClose}
              className="self-end mb-4 text-muted hover:text-text transition-colors"
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
