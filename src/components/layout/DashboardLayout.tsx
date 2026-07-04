import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AccountMenu } from './AccountMenu';
import { MobileTabBar } from './MobileTabBar';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="flex items-center justify-between px-3 md:px-8 py-2.5 border-b border-border backdrop-blur sticky top-0 z-10"
          style={{ background: 'var(--header-blur)' }}
        >
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-border/40 transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
              </svg>
            </button>
            <Link to="/" className="font-display text-lg leading-none">
              Foot<span className="text-accent">Sim</span>
            </Link>
          </div>
          <div className="hidden md:block" />
          <AccountMenu />
        </header>
        {/* overflow-x-clip : un contenu trop large ne doit jamais créer de scroll
            horizontal de page (la barre mobile fixed semblerait « décalée ») —
            les tableaux défilent dans leurs propres wrappers overflow-x-auto */}
        <main className="flex-1 min-w-0 overflow-x-clip px-3 sm:px-4 md:px-10 py-4 sm:py-6 md:py-8 pb-24 md:pb-8">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
