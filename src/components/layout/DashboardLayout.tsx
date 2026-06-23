import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AccountMenu } from './AccountMenu';

export function DashboardLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-end px-8 py-3 border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-10">
          <AccountMenu />
        </header>
        <main className="flex-1 px-10 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
