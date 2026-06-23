import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useSession } from '@/stores/session';

type NavItem = { to: string; label: string; end?: boolean; adminOnly?: boolean };
const items: NavItem[] = [
  { to: '/dashboard', label: "Vue d'ensemble", end: true },
  { to: '/dashboard/teams', label: 'Équipes' },
  { to: '/dashboard/competitions', label: 'Compétitions' },
  { to: '/match', label: 'Matchs' },
  { to: '/dashboard/meilleurs-joueurs', label: 'Meilleurs joueurs' },
  { to: '/dashboard/simulation', label: 'Simulation' },
  { to: '/dashboard/notes-joueurs', label: 'Notes joueurs' },
  { to: '/dashboard/postes', label: 'Postes' },
  { to: '/dashboard/settings', label: 'Réglages' },
];


export function Sidebar() {
  const isAdmin = useSession((s) => s.isAdmin());

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
      <div className="mb-10 px-2 font-display text-2xl">FootSim</div>
      <nav className="flex flex-col gap-1">
        {items.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
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
    </aside>
  );
}
