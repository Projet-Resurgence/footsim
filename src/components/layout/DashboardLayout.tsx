import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AccountMenu } from './AccountMenu';
import { MobileTabBar } from './MobileTabBar';

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-10">
          <button
            className="md:hidden p-2 rounded-md text-muted hover:text-text transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="hidden md:block" />
          <AccountMenu />
        </header>
        <main className="flex-1 px-3 sm:px-4 md:px-10 py-4 sm:py-6 md:py-8 pb-20 md:pb-8">
          <Outlet />
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
